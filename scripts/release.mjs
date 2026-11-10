#!/usr/bin/env node
// Atualiza a versão do launcher nos três lugares que precisam bater:
// package.json, src-tauri/tauri.conf.json e src-tauri/Cargo.toml (+ Cargo.lock).
// Uso: npm run release 0.2.0
import { readFileSync, writeFileSync } from 'node:fs'

const v = process.argv[2]
if (!/^\d+\.\d+\.\d+$/.test(v ?? '')) {
  console.error('Uso: npm run release <versão>   (ex.: npm run release 0.2.0)')
  process.exit(1)
}

const json = (file, edit) => {
  const data = JSON.parse(readFileSync(file, 'utf8'))
  edit(data)
  writeFileSync(file, JSON.stringify(data, null, 2) + '\n')
}
json('package.json', (d) => (d.version = v))
json('src-tauri/tauri.conf.json', (d) => (d.version = v))

const cargo = readFileSync('src-tauri/Cargo.toml', 'utf8').replace(/^version = ".*"$/m, `version = "${v}"`)
writeFileSync('src-tauri/Cargo.toml', cargo)
const lock = readFileSync('src-tauri/Cargo.lock', 'utf8').replace(/(name = "forbidden-launcher"\nversion = )".*"/, `$1"${v}"`)
writeFileSync('src-tauri/Cargo.lock', lock)

console.log(`Versão ${v} aplicada. Para publicar:

  git commit -am "Launcher v${v}"
  git push

Com a CI verde, a Action "Release" compila o instalador e publica a v${v}
em Releases; os launchers instalados se atualizam sozinhos.`)
