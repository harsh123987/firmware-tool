const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const { execFile } = require("child_process");
const fs = require("fs");
const os = require("os");

/* --------------------------------------------------
   Resolve bundled OpenSSL path (Windows only)
-------------------------------------------------- */
function getOpenSSLPath() {
  const base = process.resourcesPath;
    const platform = process.platform;
    const arch = process.arch;
    if(platform==="win32"){
  return arch === "x64"
    ? path.join(base, "openssl", "win64", "openssl.exe")
    : path.join(base, "openssl", "win32", "openssl.exe");
}


}

/* --------------------------------------------------
   Run OpenSSL safely (capture stderr!)
-------------------------------------------------- */
function runOpenSSL(cmd, args, cwd) {
  return new Promise((resolve, reject) => {
    execFile(
      cmd,
      args,
      { windowsHide: true, cwd },
      (err, stdout, stderr) => {
        if (err) {
          return reject(stderr?.toString() || err.message);
        }
        resolve(stdout.toString());
      }
    );
  });
}

/* --------------------------------------------------
   IPC: VERIFY
-------------------------------------------------- */
ipcMain.handle("verify", async (_, args) => {
  const {
    payload,
    signature,
    pubkey,
    signVerificationMethod,
    digests
  } = args;

  const openssl = getOpenSSLPath();

  let signatureValid = false;
  let integrityValid = true;

  /* --------------------------------------------------
     Parse algorithm
     RSA4096-SHA512 → rsa + sha512
  -------------------------------------------------- */
  const parts = signVerificationMethod.split("-");
  const signAlgo = parts[0].toLowerCase(); // rsa4096 / ecc256 etc
  const hashAlgo = parts[1].toLowerCase(); // sha256 / sha512

  const useBinary = signAlgo.startsWith("rsa");

  /* --------------------------------------------------
     Temp working directory
  -------------------------------------------------- */
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "fw-verify-"));
  const payloadPath = path.join(workDir, "payload.tar");
  const sigPath = path.join(workDir, "signature.sig");
  const keyPath = path.join(workDir, "pubkey.pem");

  try {
    /* --------------------------------------------------
       Copy files EXACTLY (binary-safe)
    -------------------------------------------------- */
    fs.copyFileSync(payload, payloadPath);
    fs.copyFileSync(signature, sigPath);
    fs.copyFileSync(pubkey, keyPath);

    /* --------------------------------------------------
       SIGNATURE VERIFICATION
    -------------------------------------------------- */
let detectedAlgo;
    try {
      detectedAlgo = await detectKeyAlgorithm(openssl, keyPath, workDir);
    } catch (err) {
      if (err.message === "WRONG_PUBLIC_KEY") {
        return {
          signatureValid: true,
          integrityValid,
          errorType: "WRONG_PUBLIC_KEY"
        };
      }

      return {
        signatureValid: true,
        integrityValid,
        errorType: "UNSUPPORTED_KEY_TYPE"
      };
    }
    const isEdDSA= detectedAlgo === "ed448" || detectedAlgo === "ed25519";

    /* --------------------------------------------------
   SIGNATURE VERIFICATION (RSA / ECDSA / EDDSA)
-------------------------------------------------- */
try {
  if (isEdDSA) {
    // ---------- ED25519 / ED448 ----------
    const verifyArgs = [
      "pkeyutl",
      "-verify",
      "-pubin",
      "-inkey", keyPath,
      "-sigfile", sigPath,
      "-in", payloadPath
    ];

    await runOpenSSL(openssl, verifyArgs, workDir);
  } else {
    // ---------- RSA / ECDSA ----------
    const verifyArgs = [
      "dgst",
      `-${hashAlgo}`,
      ...(useBinary ? ["-binary"] : []),
      "-verify", keyPath,
      "-signature", sigPath,
      payloadPath
    ];

    await runOpenSSL(openssl, verifyArgs, workDir);
  }

  signatureValid = true;
} catch {
  signatureValid = false;
}

    /* --------------------------------------------------
       FILE INTEGRITY CHECK (ALL DIGESTS)
    -------------------------------------------------- */
    /* --------------------------------------------------
       FILE INTEGRITY CHECK (HASH ORIGINAL FILE ONLY)
    -------------------------------------------------- */
    for (const d of digests) {
      const algo = d.HashAlgorithm.toLowerCase();

      const expected = d.HashValue
        .replace(/\s+/g, "")
        .toLowerCase();

      const output = await runOpenSSL(
        openssl,
        ["dgst", `-${algo}`, payload],   // ✅ ORIGINAL FILE
        path.dirname(payload)
      );

      const match = output.match(/=\s*([a-f0-9]+)/i);
      if (!match) {
        integrityValid = false;
        break;
      }

      const actual = match[1].toLowerCase();

      if (actual !== expected) {
        integrityValid = false;
        break;
      }
    }

if(!signatureValid) return { signatureValid, integrityValid };


    /* --------------------------------------------------
       ⭐ NEW: COMPARE WITH USER ENTERED METHOD    -------------------------------------------------- */
    const userAlgo = extractUserSignAlgo(signVerificationMethod);

    if (!userAlgo || userAlgo !== detectedAlgo) {
      let hashPart = signVerificationMethod?.split("-")[1] || "";
      if(detectedAlgo==="ed25519"||detectedAlgo==="ed448") hashPart= "";
      const correctMethod = hashPart
        ? `${detectedAlgo.toUpperCase()}-${hashPart}`
        : detectedAlgo.toUpperCase();

      return {
        signatureValid: true,
        integrityValid,
        errorType: "ALGO_MISMATCH",
        correctMethod
      };
    }

    return { signatureValid, integrityValid };
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
});

ipcMain.handle("hash-zip", async (_, zipBuffer) => {
  const openssl = getOpenSSLPath();

  // create temp directory
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "fw-ziphash-"));
  const zipPath = path.join(workDir, "package.zip");

  try {
    // write ZIP bytes exactly
    fs.writeFileSync(zipPath, Buffer.from(zipBuffer));

    // run OpenSSL BLAKE2b-512
    const output = await runOpenSSL(
      openssl,
      ["dgst", "-sha256", zipPath],
      workDir
    );

    // extract hash
    const match = output.match(/=\s*([a-f0-9]+)/i);
    if (!match) throw new Error("HASH_FAILED");

    return match[1].toLowerCase();
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
});
/* --------------------------------------------------
   Window
-------------------------------------------------- */
function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, "preload.js")
    }
  });

  win.loadFile(path.join(__dirname, "app", "index.html"));
}

async function detectKeyAlgorithm(opensslPath, keyPath, cwd) {
  let output;
  try {
    output = await runOpenSSL(opensslPath, [
      "pkey",
      "-in", keyPath,
      "-pubin",
      "-text",
      "-noout"
    ], cwd);
  } catch (err) {
    // OpenSSL couldn't read the key → invalid key file
    throw new Error("WRONG_PUBLIC_KEY");
  }

  const text = output.toLowerCase();

  // ---------- EDDSA ----------
  if (text.includes("ed25519")) {
    return "ed25519";
  }
  if (text.includes("ed448")) {
    return "ed448";
  }

  // ---------- ECDSA / EC ----------
  if (text.includes("asn1 oid") || text.includes("nist curve") || text.includes("ec public-key")) {
    if (text.includes("prime256v1")) return "prime256v1";
    if (text.includes("secp384r1")) return "secp384r1";
    if (text.includes("secp521r1")) return "secp521r1";
    return "ec";
  }

  // ---------- RSA ----------
  // RSA keys don't always say "RSA", but always contain Modulus + Exponent
  if (text.includes("modulus") && text.includes("exponent")) {
    const match = text.match(/public-key:\s*\((\d+)\s*bit\)/i);
    if (!match) return "rsa";

    const bits = parseInt(match[1], 10);
    if (bits === 2048) return "rsa2048";
    if (bits === 3072) return "rsa3072";
    if (bits === 4096) return "rsa4096";

    return `rsa${bits}`;
  }

  throw new Error("UNSUPPORTED_KEY_TYPE");
}
function extractUserSignAlgo(method) {
  if (!method) return null;
  return method.split("-")[0].toLowerCase(); // e.g. RSA4096-SHA512 → rsa4096
}


app.whenReady().then(createWindow);
