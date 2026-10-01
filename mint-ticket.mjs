// Forja um bilhete de login assinado com uma chave QUALQUER.
// Serve só para provar que bilhete sem a nossa assinatura é recusado na volta.
import { SignJWT } from "jose";

const secret = `${process.argv[2] || "chave-errada"}:mirai-oidc`;
const key = new TextEncoder().encode(secret);

console.log(
  await new SignJWT({ state: "y", nonce: "y", verifier: "z", next: "/dashboard/connect" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(key),
);
