/**
 * Una cadena de certificados de mentira, para probar los cobros de iOS.
 *
 * Tres certificados ES256 —raíz, intermedio y firmante— con la misma forma que
 * los que Apple pone en la cabecera de cada comprobante, y la clave privada
 * del firmante. Con esto `test-apple.mjs` puede armar comprobantes firmados y
 * recorrer el camino bueno, el que mueve la plata.
 *
 * Están acá y no se generan en cada corrida para que la prueba no dependa del
 * `openssl` de cada máquina. Se armaron con el script que está en el registro
 * del commit, vencen en 2048, y la clave privada no protege nada: la raíz es
 * propia, así que un comprobante firmado con esto sólo pasa cuando la prueba
 * pone `APPLE_ROOT_CA_PEM` a mano. Contra la raíz de Apple no vale nada.
 */
export const RAIZ = "-----BEGIN CERTIFICATE-----\nMIIB5jCCAYugAwIBAgIUFbYTYpATZtfXDHphwmA4rR5GIYswCgYIKoZIzj0EAwIw\nQDELMAkGA1UEBhMCUFkxFzAVBgNVBAoMDlplbnRyYSBwcnVlYmFzMRgwFgYDVQQD\nDA9SYWl6IGRlIG1lbnRpcmEwHhcNMjYxMDE5MTEyMjQ1WhcNNDgwOTEzMTEyMjQ1\nWjBAMQswCQYDVQQGEwJQWTEXMBUGA1UECgwOWmVudHJhIHBydWViYXMxGDAWBgNV\nBAMMD1JhaXogZGUgbWVudGlyYTBZMBMGByqGSM49AgEGCCqGSM49AwEHA0IABDb7\nlH01ywmsn2gftqyCFQokLYphFrZTDpEsrILR4Cl7DSIHcv9rtuB7GMq7228NIiVX\nzjIBFjYalxw/gUIOAHmjYzBhMB0GA1UdDgQWBBSI4Pg6vIFcSKz69+xyqmJc3gW4\nxDAfBgNVHSMEGDAWgBSI4Pg6vIFcSKz69+xyqmJc3gW4xDAPBgNVHRMBAf8EBTAD\nAQH/MA4GA1UdDwEB/wQEAwICBDAKBggqhkjOPQQDAgNJADBGAiEAgtcnil8cxjQU\n4Qk77M2pyNvDxNXvlJo7iOx2TBpesg4CIQCHW9V7WUVGFU+9G6NwoTkjoGQHFL80\nSGwuA/KUJf2YPg==\n-----END CERTIFICATE-----";

export const INTERMEDIO = "-----BEGIN CERTIFICATE-----\nMIIB6zCCAZGgAwIBAgIUXfuAZPQjCeguVIABZar6B7QkqgYwCgYIKoZIzj0EAwIw\nQDELMAkGA1UEBhMCUFkxFzAVBgNVBAoMDlplbnRyYSBwcnVlYmFzMRgwFgYDVQQD\nDA9SYWl6IGRlIG1lbnRpcmEwHhcNMjYxMDE5MTEyMjQ1WhcNNDgwOTEzMTEyMjQ1\nWjBGMQswCQYDVQQGEwJQWTEXMBUGA1UECgwOWmVudHJhIHBydWViYXMxHjAcBgNV\nBAMMFUludGVybWVkaW8gZGUgbWVudGlyYTBZMBMGByqGSM49AgEGCCqGSM49AwEH\nA0IABJruaSnQkIwuuVIU/2ClLSt/+mOoYg7/SHu0OFxFtvEjT9NlB0OVgAlJ7YUg\nPTdsoXF32ixS6XdaGRwxNsQn6p+jYzBhMA8GA1UdEwEB/wQFMAMBAf8wDgYDVR0P\nAQH/BAQDAgIEMB0GA1UdDgQWBBTH1sxO2So9GMG5k/yL8S820W7qzjAfBgNVHSME\nGDAWgBSI4Pg6vIFcSKz69+xyqmJc3gW4xDAKBggqhkjOPQQDAgNIADBFAiB4dPcb\nJm8HuiwwZnCS6k+f5jKq8K+TRWNHu1Omdoy7LwIhAM0q4L7ntC0EO02hoLzrbu/B\nRCP8rChE/zgxiF7cEBQJ\n-----END CERTIFICATE-----";

export const FIRMANTE = "-----BEGIN CERTIFICATE-----\nMIIB7DCCAZKgAwIBAgIUcT2QOW4PWIdGurpCFyq8JKbApvIwCgYIKoZIzj0EAwIw\nRjELMAkGA1UEBhMCUFkxFzAVBgNVBAoMDlplbnRyYSBwcnVlYmFzMR4wHAYDVQQD\nDBVJbnRlcm1lZGlvIGRlIG1lbnRpcmEwHhcNMjYxMDE5MTEyMjQ1WhcNNDgwOTEz\nMTEyMjQ1WjBEMQswCQYDVQQGEwJQWTEXMBUGA1UECgwOWmVudHJhIHBydWViYXMx\nHDAaBgNVBAMME0Zpcm1hbnRlIGRlIG1lbnRpcmEwWTATBgcqhkjOPQIBBggqhkjO\nPQMBBwNCAATBdMlXH7UkMpRfOYtPPR+dHE61bCvBHPaFlfmnUo5PImmn2Bfairo5\nvWHSmRRYrE9C2Klplip6ubQs+lCZzv1mo2AwXjAMBgNVHRMBAf8EAjAAMA4GA1Ud\nDwEB/wQEAwIHgDAdBgNVHQ4EFgQUJ+d0FF2tQF9Tvx7gX3E4BVQXj5swHwYDVR0j\nBBgwFoAUx9bMTtkqPRjBuZP8i/EvNtFu6s4wCgYIKoZIzj0EAwIDSAAwRQIgMBf9\ntTr7LxK1AQ1/LtokSxNCbYrgS1V1vDr4NxZsq74CIQDmQyC2tsJfp2aRfUd23ito\no+Vrsq8iLEel1S5ABSkxJQ==\n-----END CERTIFICATE-----";

export const CLAVE_FIRMANTE = "-----BEGIN PRIVATE KEY-----\nMIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgM90fxAG6wL5WRwFG\nfrgSssfsc2OneeTSdgvk5VVyVAqhRANCAATBdMlXH7UkMpRfOYtPPR+dHE61bCvB\nHPaFlfmnUo5PImmn2Bfairo5vWHSmRRYrE9C2Klplip6ubQs+lCZzv1m\n-----END PRIVATE KEY-----";
