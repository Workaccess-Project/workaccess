# WORKACCESS - BUILD METADATA

This project supports optional build metadata:

- BUILD_SHA: Git commit SHA of the deployed version
- BUILD_TIME: Deployment/build time in ISO 8601 format (UTC recommended)

These variables are safe to expose (they are not secrets).

## Example values

BUILD_SHA=08eeca3
BUILD_TIME=2026-02-22T18:30:00Z

## How to set on VPS (recommended)

1) Get current commit SHA on VPS:

git rev-parse --short HEAD

2) Get current UTC time:

date -u +"%Y-%m-%dT%H:%M:%SZ"

3) Put both into your production env file:

backend/.env.production

## Notes

- Do not commit the real backend/.env.production file.
- Only commit backend/.env.production.example (template).