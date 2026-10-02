/**
 * Deja que node importe los `.ts` del proyecto con imports sin extensión y con
 * `@/`, igual que los resuelve Next. Se usa con `--import ./test/hook.mjs`.
 */
import { register } from "node:module";
import { pathToFileURL } from "node:url";

register(pathToFileURL(new URL("resolver.mjs", import.meta.url).pathname));
