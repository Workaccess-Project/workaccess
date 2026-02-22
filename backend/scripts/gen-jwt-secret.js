#!/usr/bin/env node

import crypto from 'crypto';

const bytes = 64; // 64 bytes => 128 hex chars
const secret = crypto.randomBytes(bytes).toString('hex');

console.log('JWT_SECRET=' + secret);
