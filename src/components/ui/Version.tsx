/** Renderiza um texto destacando a versão do jogo ("1.7.10") com a cor de destaque do tema. */
export function Versioned({ text, version = '1.7.10' }: { text: string; version?: string }) {
  const parts = text.split(version)
  return (
    <>
      {parts.map((p, i) => (
        <span key={i}>
          {p}
          {i < parts.length - 1 && <span className="text-version">{version}</span>}
        </span>
      ))}
    </>
  )
}
