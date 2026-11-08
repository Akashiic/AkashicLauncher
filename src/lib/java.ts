/**
 * Runtime Java do launcher: Azul Zulu 8 (1.8.0_512), incluso e gerenciado pelo launcher.
 * Fonte única — a implementação real (download/extração/verificação) deve ler daqui.
 *
 * Nesta versão o runtime é simulado: nada é baixado nem executado.
 */
export const JAVA_RUNTIME = {
  vendor: 'Azul Zulu',
  name: 'Java 8',
  version: '1.8.0_512',
  update: '8u512',
  arch: '64-bit',
  /** Pasta do runtime relativa à pasta de dados do launcher. */
  dir: 'runtime/zulu-8u512',
  /** Executável (javaw no Windows: sem janela de console). */
  executable: 'runtime/zulu-8u512/bin/javaw.exe',
  /** Linha que o JVM imprime ao iniciar (usada nos logs simulados). */
  vmBanner: 'OpenJDK 64-Bit Server VM (Zulu 8u512), version 1.8.0_512',
} as const

export const javaLabel = `${JAVA_RUNTIME.vendor} · ${JAVA_RUNTIME.name} (${JAVA_RUNTIME.version})`
