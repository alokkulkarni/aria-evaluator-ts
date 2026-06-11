// src/lib/password.ts
// Password hashing and validation utilities

import bcrypt from 'bcrypt';
import crypto from 'crypto';

const SALT_ROUNDS = 12;
const MIN_PASSWORD_LENGTH = 8;

export interface PasswordStrengthResult {
  score: number; // 0-100
  feedback: string[];
  isStrong: boolean;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function validatePasswordStrength(password: string): PasswordStrengthResult {
  const feedback: string[] = [];
  let score = 0;

  if (password.length < MIN_PASSWORD_LENGTH) {
    feedback.push(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  } else {
    score += 20;
  }

  if (password.length >= 12) score += 10;
  if (password.length >= 16) score += 10;

  if (/[a-z]/.test(password)) {
    score += 15;
  } else {
    feedback.push('Add lowercase letters');
  }

  if (/[A-Z]/.test(password)) {
    score += 15;
  } else {
    feedback.push('Add uppercase letters');
  }

  if (/[0-9]/.test(password)) {
    score += 15;
  } else {
    feedback.push('Add numbers');
  }

  if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    score += 25;
  } else {
    feedback.push('Add special characters for extra security');
  }

  // Check for common patterns
  const commonPatterns = [
    /(.)\1{2,}/,  // Repeated characters (aaa, 111, etc)
    /12345/,      // Sequential numbers
    /abc/i,       // Sequential letters
    /password/i,  // Contains "password"
    /admin/i,     // Contains "admin"
    /qwerty/i,    // QWERTY pattern
  ];

  let hasCommonPattern = false;
  for (const pattern of commonPatterns) {
    if (pattern.test(password)) {
      hasCommonPattern = true;
      feedback.push('Avoid common patterns and dictionary words');
      break;
    }
  }

  if (hasCommonPattern) {
    score = Math.max(0, score - 20);
  }

  const isStrong = score >= 60 && feedback.length === 0;

  return {
    score: Math.min(100, Math.max(0, score)),
    feedback,
    isStrong,
  };
}

export function generateSecureToken(length: number = 32): string {
  return crypto.randomBytes(length).toString('hex');
}

export function generatePasswordResetToken(): string {
  return generateSecureToken(32);
}
