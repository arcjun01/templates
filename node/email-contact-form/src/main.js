import { Client, Databases } from 'appwrite';
import querystring from 'node:querystring';
import dotenv from 'dotenv'; // Import dotenv
import { getCorsHeaders, isOriginPermitted } from './cors.js';
import { getStaticFile, throwIfMissing, urlWithCodeParam, templateFormMessage, sendEmail } from './utils.js';

// Load environment variables from .env file
dotenv.config();

// Initialize Appwrite Client
const client = new Client();

try {
  // Configure Appwrite client with environment variables
  client
    .setEndpoint(process.env.APPWRITE_ENDPOINT) // Appwrite endpoint
    .setProject(process.env.APPWRITE_PROJECT); // Appwrite project ID

  console.log('Appwrite client configured:', {
    endpoint: client.config.endpoint,
    project: client.config.project,
  });
} catch (error) {
  console.error('Error configuring Appwrite client:', error.message);
  process.exit(1); // Exit the process if configuration fails
}

// Initialize Appwrite Database (Optional, if you want to store form data)
const databases = new Databases(client);

// Error Codes
const ErrorCode = {
  INVALID_REQUEST: 'invalid-request',
  MISSING_FORM_FIELDS: 'missing-form-fields',
  SERVER_ERROR: 'server-error',
};

export default async ({ req, res, log, error }) => {
  // Validate required environment variables
  throwIfMissing(process.env, [
    'SUBMIT_EMAIL',
    'SMTP_HOST',
    'SMTP_USERNAME',
    'SMTP_PASSWORD',
    'APPWRITE_ENDPOINT',
    'APPWRITE_PROJECT',
  ]);

  if (req.method === 'GET' && req.path === '/') {
    return res.text(getStaticFile('index.html'), 200, { 'Content-Type': 'text/html; charset=utf-8' });
  }

  if (req.headers['content-type'] !== 'application/x-www-form-urlencoded') {
    error('Incorrect content type.');
    return res.redirect(urlWithCodeParam(req.headers['referer'], ErrorCode.INVALID_REQUEST));
  }

  if (!isOriginPermitted(req)) {
    error('Origin not permitted.');
    return res.redirect(urlWithCodeParam(req.headers['referer'], ErrorCode.INVALID_REQUEST));
  }

  const form = querystring.parse(req.body);
  try {
    throwIfMissing(form, ['email']);
  } catch (err) {
    return res.redirect(urlWithCodeParam(req.headers['referer'], err.message), 301, getCorsHeaders(req));
  }

  // Optionally, Store the Form Data in Appwrite Database
  try {
    await databases.createDocument(
      'YOUR_COLLECTION_ID', // Replace with your Appwrite collection ID
      'unique()', // Document ID
      {
        email: form.email,
        message: form.message,
        name: form.name || 'Anonymous',
        submittedAt: new Date().toISOString(),
      }
    );
  } catch (err) {
    error('Error saving form data to Appwrite: ' + err.message);
    return res.redirect(urlWithCodeParam(req.headers['referer'], ErrorCode.SERVER_ERROR), 301, getCorsHeaders(req));
  }

  // Send email
  try {
    sendEmail({
      to: process.env.SUBMIT_EMAIL,
      from: process.env.SMTP_USERNAME,
      subject: `New form submission: ${req.headers['referer']}`,
      text: templateFormMessage(form),
    });
  } catch (err) {
    error(err.message);
    return res.redirect(urlWithCodeParam(req.headers['referer'], ErrorCode.SERVER_ERROR), 301, getCorsHeaders(req));
  }

  if (typeof form._next !== 'string' || !form._next) {
    return res.text(getStaticFile('success.html'), 200, { 'Content-Type': 'text/html; charset=utf-8' });
  }

  const baseUrl = new URL(req.headers['referer']).origin;

  log(`Redirecting to ${new URL(form._next, baseUrl).toString()}`);

  return res.redirect(new URL(form._next, baseUrl).toString(), 301, getCorsHeaders(req));
};
