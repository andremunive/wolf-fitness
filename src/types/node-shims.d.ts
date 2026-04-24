// Shims mínimos para que los types de `@supabase/storage-js` resuelvan en un
// build browser (el SDK declara `Buffer` y `NodeJS.ReadableStream` en tipos de
// upload que solo se usan en Node). No habilitamos `@types/node` porque trae
// declaraciones (Symbol.dispose, TextEncoder) más nuevas que TS 5.1 y rompen
// el build. Aquí solo declaramos los tipos ausentes como opacos.

declare type Buffer = unknown;

declare namespace NodeJS {
  // eslint-disable-next-line @typescript-eslint/no-empty-interface
  interface ReadableStream {}
}
