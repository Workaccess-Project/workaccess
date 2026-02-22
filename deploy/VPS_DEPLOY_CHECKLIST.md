# WORKACCESS - VPS DEPLOY CHECKLIST (v1)

## 1. Server Preparation

- [ ] VPS running (Ubuntu 22.04 recommended)
- [ ] Node.js LTS installed
- [ ] PM2 installed globally
- [ ] Nginx installed
- [ ] UFW firewall enabled
- [ ] Ports open: 80, 443

---

## 2. Application Setup

- [ ] Git clone repository
- [ ] cd backend
- [ ] npm ci
- [ ] Copy .env.production from template
- [ ] Generate JWT secret (node scripts/gen-jwt-secret.js)
- [ ] Fill CORS_ORIGINS with real domains
- [ ] Configure SMTP (or leave all empty)

---

## 3. First Production Start

- [ ] pm2 start ecosystem.config.cjs --env production
- [ ] pm2 status (must show online)
- [ ] pm2 logs (no crash loop)
- [ ] curl http://localhost:3000/api/health

---

## 4. Nginx Reverse Proxy

- [ ] Configure nginx
- [ ] Proxy to http://localhost:3000
- [ ] Set client_max_body_size
- [ ] Enable HTTPS (Let's Encrypt)
- [ ] Test domain in browser

---

## 5. Final Validation

- [ ] Login works
- [ ] JWT-only enforced
- [ ] Trial works
- [ ] Billing gate works
- [ ] File upload works
- [ ] Rate limiting works
- [ ] No server crashes

---

## 6. Post-Deploy

- [ ] pm2 save
- [ ] pm2 startup
- [ ] Backup strategy defined
- [ ] Monitoring defined