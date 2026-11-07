# Áudio local (opcional)

O launcher sintetiza todos os sons via Web Audio API. Para usar arquivos reais,
coloque-os aqui e registre em `src/audio/AudioManager.ts` (final do arquivo):

```ts
audio.registerSample('click', './audio/click.ogg')   // substitui o SFX sintetizado
audio.setBgmTrack('./audio/theme.ogg')               // BGM em loop
audio.setAmbienceTrack('./audio/wind.ogg')           // ambiência (SBFX)
```

Nomes de SFX disponíveis: hover, click, toggleOn, toggleOff, tick, tab, open, close,
success, error, whoosh, chime, play.
