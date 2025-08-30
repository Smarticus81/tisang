import { google } from 'googleapis';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Gmail API scopes
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.modify'
];

const TOKEN_PATH = path.join(__dirname, 'gmail-token.json');
const CREDENTIALS_PATH = path.join(__dirname, 'gmail-credentials.json');

class GmailService {
  constructor() {
    this.auth = null;
    this.gmail = null;
  }

  async initialize() {
    try {
      // Prefer credentials from environment for cloud deployments
      let credentials = null;
      const credsFromEnv = process.env.GMAIL_CREDENTIALS_JSON;
      if (credsFromEnv) {
        try {
          credentials = JSON.parse(credsFromEnv);
        } catch (e) {
          console.error('Failed to parse GMAIL_CREDENTIALS_JSON env var:', e?.message);
          return false;
        }
      } else {
        // Fallback to credentials file on local/dev
        const credentialsExist = await fs.access(CREDENTIALS_PATH).then(() => true).catch(() => false);
        if (!credentialsExist) {
          console.log('Gmail credentials not found. Provide GMAIL_CREDENTIALS_JSON env var or add backend/gmail-credentials.json.');
          return false;
        }
        credentials = JSON.parse(await fs.readFile(CREDENTIALS_PATH, 'utf8'));
      }
      const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;
      
      // Use our auth redirect endpoint
      const redirectUri = process.env.NODE_ENV === 'production' 
        ? 'https://tisang-production.up.railway.app/api/gmail/auth-redirect'
        : 'http://localhost:3001/api/gmail/auth-redirect';
      
      this.auth = new google.auth.OAuth2(client_id, client_secret, redirectUri);

      // Check if we have a stored token (prefer env var for cloud)
      const tokenFromEnv = process.env.GMAIL_TOKEN_JSON;
      if (tokenFromEnv) {
        try {
          this.auth.setCredentials(JSON.parse(tokenFromEnv));
        } catch (e) {
          console.error('Failed to parse GMAIL_TOKEN_JSON env var:', e?.message);
          return false;
        }
      } else {
        try {
          const token = await fs.readFile(TOKEN_PATH, 'utf8');
          this.auth.setCredentials(JSON.parse(token));
        } catch (err) {
          console.log('No stored Gmail token found. Gmail features will require authentication.');
          return false;
        }
      }

      this.gmail = google.gmail({ version: 'v1', auth: this.auth });
      return true;
    } catch (error) {
      console.error('Failed to initialize Gmail service:', error);
      return false;
    }
  }

  async getAuthUrl() {
    if (!this.auth) {
      throw new Error('Gmail service not initialized');
    }

    const authUrl = this.auth.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
    });
    return authUrl;
  }

  async setAuthCode(code) {
    if (!this.auth) {
      throw new Error('Gmail service not initialized');
    }

    const { tokens } = await this.auth.getToken(code);
    this.auth.setCredentials(tokens);
    
    // Store the token for future use (filesystem; for cloud consider secrets store)
    try {
      await fs.writeFile(TOKEN_PATH, JSON.stringify(tokens));
    } catch (e) {
      console.warn('Could not persist gmail-token.json to disk. For Railway, set GMAIL_TOKEN_JSON env var with token JSON.');
    }
    
    this.gmail = google.gmail({ version: 'v1', auth: this.auth });
    return true;
  }

  async getRecentEmails(maxResults = 10) {
    if (!this.gmail) {
      throw new Error('Gmail not authenticated');
    }

    try {
      const response = await this.gmail.users.messages.list({
        userId: 'me',
        maxResults,
        q: 'in:inbox'
      });

      if (!response.data.messages) {
        return [];
      }

      const emails = [];
      for (const message of response.data.messages.slice(0, 5)) { // Limit to 5 for performance
        const email = await this.gmail.users.messages.get({
          userId: 'me',
          id: message.id,
          format: 'full'
        });

        const headers = email.data.payload.headers;
        const subject = headers.find(h => h.name === 'Subject')?.value || 'No Subject';
        const from = headers.find(h => h.name === 'From')?.value || 'Unknown';
        const date = headers.find(h => h.name === 'Date')?.value || '';

        // Get email body
        let body = '';
        if (email.data.payload.body?.data) {
          body = Buffer.from(email.data.payload.body.data, 'base64').toString();
        } else if (email.data.payload.parts) {
          for (const part of email.data.payload.parts) {
            if (part.mimeType === 'text/plain' && part.body?.data) {
              body = Buffer.from(part.body.data, 'base64').toString();
              break;
            }
          }
        }

        emails.push({
          id: message.id,
          subject,
          from,
          date,
          snippet: email.data.snippet,
          body: body.slice(0, 500) // Limit body length
        });
      }

      return emails;
    } catch (error) {
      console.error('Failed to get emails:', error);
      throw new Error('Failed to retrieve emails');
    }
  }

  async searchEmails(query, maxResults = 5) {
    if (!this.gmail) {
      throw new Error('Gmail not authenticated');
    }

    try {
      const response = await this.gmail.users.messages.list({
        userId: 'me',
        maxResults,
        q: query
      });

      if (!response.data.messages) {
        return [];
      }

      const emails = [];
      for (const message of response.data.messages) {
        const email = await this.gmail.users.messages.get({
          userId: 'me',
          id: message.id,
          format: 'metadata',
          metadataHeaders: ['Subject', 'From', 'Date']
        });

        const headers = email.data.payload.headers;
        const subject = headers.find(h => h.name === 'Subject')?.value || 'No Subject';
        const from = headers.find(h => h.name === 'From')?.value || 'Unknown';
        const date = headers.find(h => h.name === 'Date')?.value || '';

        emails.push({
          id: message.id,
          subject,
          from,
          date,
          snippet: email.data.snippet
        });
      }

      return emails;
    } catch (error) {
      console.error('Failed to search emails:', error);
      throw new Error('Failed to search emails');
    }
  }
}

export default GmailService;
