import fs from "node:fs";
import path from "node:path";

// Permite versionamento controlado por pipeline (APP_VERSION) e fallback em timestamp.
const buildTime = new Date().toISOString();
const fallbackVersion = buildTime
  .replace(/[-:]/g, "")
  .replace("T", ".")
  .replace("Z", "")
  .slice(0, 15);
const version = process.env.APP_VERSION || fallbackVersion;

const versionPayload = {
  version,
  buildTime,
};

const rootDir = process.cwd();
const publicDir = path.join(rootDir, "public");
const generatedDir = path.join(rootDir, "src", "generated");

fs.mkdirSync(publicDir, { recursive: true });
fs.mkdirSync(generatedDir, { recursive: true });

// Arquivo público consultado em runtime para detectar nova versão sem service worker.
fs.writeFileSync(path.join(publicDir, "version.json"), `${JSON.stringify(versionPayload, null, 2)}\n`);

// Arquivo TypeScript consumido pelo front para saber qual versão está em execução.
const buildInfoTs = `// Arquivo gerado automaticamente por scripts/generate-version.mjs\n// Mantém frontend e /version.json sincronizados no mesmo build.\nexport const APP_VERSION = ${JSON.stringify(version)};\nexport const APP_BUILD_TIME = ${JSON.stringify(buildTime)};\n`;

fs.writeFileSync(path.join(generatedDir, "build-info.ts"), buildInfoTs);

console.log(`[version] generated public/version.json -> ${version}`);
