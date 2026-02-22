# Workaccess Backend – Deploy (Staging/VPS)

Tento dokument popisuje minimální bezpečný postup, jak spustit Workaccess backend na VPS.

## 1) Požadavky
- Linux VPS (Ubuntu/Debian doporučeno)
- Node.js LTS (ideálně 18+)
- Git
- Reverse proxy (nginx) + HTTPS (certbot) doporučeno
- PM2 pro správu procesu

## 2) Klon repozitáře
```bash
git clone <YOUR_REPO_URL> workaccess
cd workaccess
git checkout box/multitenant