# DFW Beaver API — Cloudflare Worker

This is the free portable inference backend for the live demo. It replaces the
AWS Lambda/Bedrock beaver and animal agents with Cloudflare Workers AI's
`@cf/microsoft/resnet-50` ImageNet classifier.

## Deploy

```bash
npm install
npx wrangler login
npm run deploy
```

Copy the resulting `https://dfw-beaver-api.<subdomain>.workers.dev` URL into
the frontend's `BEAVER_API_BASE_URL` environment variable, then redeploy the
frontend.

The Worker intentionally keeps batch/S3 routes unavailable rather than
removing them: those controls remain in the UI as AWS legacy functionality.
