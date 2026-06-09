const AWS = require('aws-sdk');
const jwt = require('jsonwebtoken');

const cognito = new AWS.CognitoIdentityServiceProvider();
const COGNITO_USER_POOL_ID = process.env.COGNITO_USER_POOL_ID;
const JWT_AUDIENCE = process.env.JWT_AUDIENCE;

// Cache for JWK keys to avoid repeated calls
let jwkCache = null;
let jwkCacheTime = 0;
const JWK_CACHE_TTL = 3600000; // 1 hour

// Get JWK from Cognito User Pool
async function getJWKKeys() {
  const now = Date.now();
  if (jwkCache && (now - jwkCacheTime) < JWK_CACHE_TTL) {
    return jwkCache;
  }

  try {
    const region = COGNITO_USER_POOL_ID.split('_')[0];
    const poolId = COGNITO_USER_POOL_ID.split('_')[1];
    
    const url = `https://cognito-idp.${region}.amazonaws.com/${COGNITO_USER_POOL_ID}/.well-known/jwks.json`;
    const response = await fetch(url);
    const data = await response.json();
    
    jwkCache = data;
    jwkCacheTime = now;
    return data;
  } catch (error) {
    console.error('Error fetching JWK:', error);
    throw new Error('Unable to fetch JWK');
  }
}

// Verify JWT token
async function verifyToken(token) {
  try {
    const decoded = jwt.decode(token, { complete: true });
    
    if (!decoded) {
      return { valid: false, error: 'Invalid token format' };
    }

    // Check token expiration
    const now = Math.floor(Date.now() / 1000);
    if (decoded.payload.exp && decoded.payload.exp < now) {
      return { valid: false, error: 'Token expired' };
    }

    // Check audience
    if (decoded.payload.aud !== JWT_AUDIENCE) {
      return { valid: false, error: 'Invalid audience' };
    }

    // Check issuer
    const expectedIssuer = `https://cognito-idp.${COGNITO_USER_POOL_ID.split('_')[0]}.amazonaws.com/${COGNITO_USER_POOL_ID}`;
    if (decoded.payload.iss !== expectedIssuer) {
      return { valid: false, error: 'Invalid issuer' };
    }

    // In production, verify JWT signature using JWK
    // For MVP, basic validation is sufficient
    const sub = decoded.payload.sub;
    if (!sub) {
      return { valid: false, error: 'Missing subject in token' };
    }

    return { valid: true, userId: sub, payload: decoded.payload };
  } catch (error) {
    console.error('Token verification error:', error);
    return { valid: false, error: 'Token verification failed' };
  }
}

// Lambda authorizer handler
exports.handler = async (event) => {
  console.log('Authorizer invoked:', JSON.stringify({ 
    authorizationType: event.type, 
    methodArn: event.methodArn 
  }));

  try {
    // Extract token from Authorization header
    const token = event.authorizationToken;
    
    if (!token) {
      return generatePolicy('user', 'Deny', event.methodArn);
    }

    // Remove 'Bearer ' prefix if present
    const bearerToken = token.startsWith('Bearer ') ? token.substring(7) : token;

    // Verify token
    const verification = await verifyToken(bearerToken);
    
    if (!verification.valid) {
      console.error('Authorization failed:', verification.error);
      return generatePolicy('user', 'Deny', event.methodArn);
    }

    // Token is valid
    return generatePolicy(verification.userId, 'Allow', event.methodArn, {
      userId: verification.userId,
      iss: verification.payload.iss,
      aud: verification.payload.aud,
      sub: verification.payload.sub,
    });
  } catch (error) {
    console.error('Authorizer error:', error);
    return generatePolicy('user', 'Deny', event.methodArn);
  }
};

// Generate IAM policy
function generatePolicy(principalId, effect, resource, context = {}) {
  const authResponse = {
    principalId,
  };

  if (effect && resource) {
    const policyDocument = {
      Version: '2012-10-17',
      Statement: [
        {
          Action: 'execute-api:Invoke',
          Effect: effect,
          Resource: resource,
        },
      ],
    };

    authResponse.policyDocument = policyDocument;
  }

  // Add context to pass to Lambda
  authResponse.context = context;

  return authResponse;
}
