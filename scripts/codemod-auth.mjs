// One-shot codemod: swap Clerk's auth()/getUserByClerkId in API routes for the
// provider-aware getAuthIdentity()/getAppUser() shims. Gate lines + error
// messages are left verbatim, so authorization is preserved by construction.
// Skips /api/user/sync (keeps Clerk during the dual-stack transition).
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

const files = execSync(
  `grep -rl 'import { auth } from "@clerk/nextjs/server"' src/app/api`,
  { encoding: "utf8" }
)
  .trim()
  .split("\n")
  .filter(Boolean);

let changed = 0;
for (const file of files) {
  let s = readFileSync(file, "utf8");
  const orig = s;
  const needsAppUser = s.includes("getUserByClerkId");

  // Replace the (standalone) Clerk auth import in place with the shim import.
  const shimImports = needsAppUser
    ? "getAuthIdentity, getAppUser"
    : "getAuthIdentity";
  s = s.replace(
    /import \{ auth \} from "@clerk\/nextjs\/server";\n/,
    `import { ${shimImports} } from "@/lib/auth/current-user";\n`
  );

  // Trim getUserByClerkId out of the users-query import (3 known shapes).
  s = s
    .replace(
      /import \{ getUserByClerkId \} from "@\/lib\/db\/queries\/users";\n/,
      ""
    )
    .replace(/\{ createUser, getUserByClerkId \}/, "{ createUser }")
    .replace(/\{ getUserByClerkId, updateUser \}/, "{ updateUser }");

  // Call-site swaps.
  s = s.replaceAll("await auth()", "await getAuthIdentity()");
  s = s.replaceAll("getUserByClerkId(", "getAppUser(");

  if (s !== orig) {
    writeFileSync(file, s);
    changed++;
  }
}
console.log(`codemod: rewrote ${changed}/${files.length} route files`);
