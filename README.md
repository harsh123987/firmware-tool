# Firmware Update Artifact Packaging Tool

A standalone desktop application built using **Electron** to securely package firmware
update artifacts. The tool validates mandatory metadata, performs cryptographic
signature verification and file integrity checks, and generates a distributable ZIP
bundle for vendor submissions.

---

## ✨ Key Capabilities

- Standalone Windows application (no external setup required)
- Mandatory metadata validation based on defined schema
- Cryptographic signature verification using bundled OpenSSL
- File integrity verification using user-provided digests
- Support for RSA, ECDSA, and EDDSA signing algorithms
- Prefill metadata fields from an existing JSON file
- Automatic generation of a ZIP bundle containing:
  - `metadata.json`
  - Payload file
  - Signature file
  - Public key

---

## 🧩 High-Level Architecture

- **Renderer (HTML/CSS/JS)**  
  User interface, form validation, ZIP generation

- **Preload Layer**  
  Secure IPC bridge between UI and main process

- **Main Process**  
  Cryptographic verification and integrity checks using bundled OpenSSL

The application is fully offline and does not rely on system-installed tools.

---

## 🔐 Verification Flow

1. User fills required metadata fields and uploads payload, signature, and public key
2. On clicking **Save JSON**:
   - Required-field validation is performed
   - Signature verification is executed
   - File integrity is verified using provided digests
3. If verification succeeds:
   - `metadata.json` is generated
   - All artifacts are packaged into a ZIP file
4. If verification fails:
   - Clear and specific error messages are shown

---

## 🧪 Supported Cryptography

**Signing Algorithms**
- RSA (2048 / 3072 / 4096)
- ECDSA (prime256v1, secp384r1, secp521r1)
- EDDSA (ED25519, ED448)

**Hash Algorithms**
- SHA256
- SHA384
- SHA512

---

## Prerequisites for running the code on your system

- Node (version 20 or above).

## 🛠 Run the project

```bash
npm install
npm start
```
- Place the 'openssl' folder under 'node_modules/electron/dist/resources' before executing 'npm start'.

### Generate the build (.exe)

```bash
npm run build
```
- The .exe file will be present in dist folder.

## Project structure

```text
main.js        – Main process (OpenSSL, verification)
preload.js     – Secure IPC bridge
renderer.js    – Renderer-side orchestration
app/index.html – UI (HTML/CSS/JS)
openssl/       – Bundled OpenSSL binaries
```

## 📘 Sample `metadata.json`

- Use this json file as a reference-

```json
{
    "SchemaVersion": "1.0",
    "UpdateableComponentType": "Firmware",
    "Manufacturer": "Delta",
    "EquipmentType": "Power Equipment",
    "EquipmentSoftwareIdentifiers": [
        {
            "IdType": "Model",
            "IdValue": "AC-216 A"
        }
    ],
    "UpdateableComponentName": "Power Management Controller",
    "UpdateSoftwareVersion": "5.09.0",
	"UpdateSoftwareCriticality": "Urgent",
    "PartOfEnclosure": true,
    "EnclosureDetails": {
        "EnclosureEquipmentType": "Power Shelf Rack",
        "EnclosureEquipmentIdentifiers": [
			{
				"IdType": "Model",
				"IdValue": "DELTA ORv3 33kW Power Shelf"
			}
		]
    },
    "PackageInfo": {
        "BaseLocation": "https://firmware.delta.com",
        "FilePath": "image/signed_AC216A_v5.09.tar",
        "EmbeddedSignature":false,
        "SignVerificationMethod": "RSA4096-SHA512",
        "SignVerificationAttributes": {
            "SignFileLocation": "firmware.delta.com/signatures/signed_AC216A_v5.09.sig",
            "PublicKeyFileLocation": "firmware.delta.com/keys/AC216A.pub.pem"
        },
        "FileDigests": [
            {
                "HashAlgorithm": "SHA256",
                "HashValue": "c7ccc5be6c8b9e25d83a61677ac138fa2c87f775e18aea273578c2ecee00c7d9"
            }
        ]
    },
    "PackageDependency": {
        "MinimumInstalledVersion": "4.14.0"
    },
    "UpdateActivationRequirements": {
        "ControllerReboot": true,
        "EnclosureReboot": false
    }
}
 ```
 ## Disclaimer

This tool is intended for internal or controlled vendor usage.
Cryptographic verification relies on bundled OpenSSL binaries.

