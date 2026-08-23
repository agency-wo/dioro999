/* Prints the SALT and LOGIN_HASH constants for assets/js/admin.js.
   The password is read from the environment, never from argv and never written anywhere.

   usage (PowerShell):
     $env:DIORO_PW = "<the password>"; node _tools/hash.mjs Olsi; Remove-Item Env:DIORO_PW

   Recipe (must match loginHash() in admin.js byte for byte):
     PBKDF2-HMAC-SHA256( utf8(username.toLowerCase() + ":" + password),
                         salt = utf8(16 random bytes as 32 hex chars),
                         iterations = 250000, length = 32 bytes ) -> hex
*/
import { pbkdf2Sync, randomBytes } from "node:crypto";

const user = (process.argv[2] || "").trim();
const pw = process.env.DIORO_PW || "";
if (!user || !pw) {
  console.error("usage: DIORO_PW=<password> node _tools/hash.mjs <username>");
  process.exit(2);
}
if (pw.length < 12) console.error("warning: the hash is public, use a password of 12+ characters");
const salt = randomBytes(16).toString("hex");
const hash = pbkdf2Sync(user.toLowerCase() + ":" + pw, salt, 250000, 32, "sha256").toString("hex");
console.log('var SALT = "' + salt + '";');
console.log('var LOGIN_HASH = "' + hash + '";');
