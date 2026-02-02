function normalizeHashAlgo(algo) {
  // Accept: SHA256, sha256, SHA-256, sha-256
  return algo.replace("-", "").toLowerCase();
}

async function runVerification() {
  const payload = document.getElementById("PayloadUpload").files[0];
  const sign = document.getElementById("SignUpload").files[0];
  const pub = document.getElementById("PublicKeyUpload").files[0];

  if (!payload || !sign || !pub) {
    throw new Error("Missing required files");
  }

  /* -----------------------------------------
     Collect file digests
  ----------------------------------------- */
  const digests = Array.from(
    document.querySelectorAll("#FileDigests .array-item")
  ).map(r => ({
    HashAlgorithm: normalizeHashAlgo(
      r.querySelector(".hashAlgo").value
    ),
    HashValue: r.querySelector(".hashValue").value.toLowerCase()
  }));

  /* -----------------------------------------
     IMPORTANT: send FULL method string
     Example: RSA4096-SHA512
  ----------------------------------------- */
  const signVerificationMethod = document.getElementById("SignAlgorithm").value+'-'+document.getElementById("HashAlgorithm").value;
  if (!signVerificationMethod) {
    throw new Error("Missing SignVerificationMethod");
  }




  return await window.firmwareAPI.verify({
    payload: payload.path,
    signature: sign.path,
    pubkey: pub.path,
    signVerificationMethod,   // ✅ FIXED
    digests
  });
}
