// Local development only.  Production must set BEAVER_API_BASE_URL to the
// standalone JS backend; never fall back to the retired AWS API Gateway.
const LOCAL_API_BASE = "http://127.0.0.1:7860";

export function resolveBeaverApiBase() {
  const fromEnv =
    process.env.BEAVER_API_BASE_URL ||
    process.env.NEXT_PUBLIC_BEAVER_API_BASE_URL ||
    process.env.AMPLIFY_BEAVER_API_BASE_URL;

  return {
    value: fromEnv || LOCAL_API_BASE,
    source: fromEnv ? "env" : "fallback",
  };
}
