import { google } from 'googleapis';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Gmail API and Calendar scopes
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events'
];

const TOKEN_PATH = path.join(__dirname, 'gmail-token.json');
const CREDENTIALS_PATH = path.join(__dirname, 'gmail-credentials.json');

class GmailService {
  constructor() {
    this.auth = null;
    this.gmail = null;
    this.calendar = null;
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
        : 'http://localhost:3000/api/gmail/auth-redirect';
      
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
      this.calendar = google.calendar({ version: 'v3', auth: this.auth });
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
    this.calendar = google.calendar({ version: 'v3', auth: this.auth });
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

  async getEmailById(emailId) {
    if (!this.gmail) {
      throw new Error('Gmail not authenticated');
    }

    try {
      const email = await this.gmail.users.messages.get({
        userId: 'me',
        id: emailId,
        format: 'full'
      });

      const headers = email.data.payload.headers;
      const subject = headers.find(h => h.name === 'Subject')?.value || 'No Subject';
      const from = headers.find(h => h.name === 'From')?.value || 'Unknown';
      const to = headers.find(h => h.name === 'To')?.value || 'Unknown';
      const date = headers.find(h => h.name === 'Date')?.value || '';

      // Get email body
      let body = '';
      let htmlBody = '';

      if (email.data.payload.body?.data) {
        body = Buffer.from(email.data.payload.body.data, 'base64').toString();
      } else if (email.data.payload.parts) {
        for (const part of email.data.payload.parts) {
          if (part.mimeType === 'text/plain' && part.body?.data) {
            body = Buffer.from(part.body.data, 'base64').toString();
          }
          if (part.mimeType === 'text/html' && part.body?.data) {
            htmlBody = Buffer.from(part.body.data, 'base64').toString();
          }
        }
      }

      return {
        id: emailId,
        subject,
        from,
        to,
        date,
        snippet: email.data.snippet,
        body,
        htmlBody,
        threadId: email.data.threadId,
        labelIds: email.data.labelIds
      };
    } catch (error) {
      console.error('Failed to get email:', error);
      throw new Error('Failed to retrieve email');
    }
  }

  async sendEmail({ to, subject, text, cc, bcc, html, replyTo, threadId, inReplyTo, references }) {
    if (!this.gmail) {
      throw new Error('Gmail not authenticated');
    }

    try {
      // Build email headers
      const headers = [
        `To: ${to}`,
        `Subject: ${subject}`
      ];

      if (cc) headers.push(`Cc: ${cc}`);
      if (bcc) headers.push(`Bcc: ${bcc}`);
      if (replyTo) headers.push(`Reply-To: ${replyTo}`);
      if (inReplyTo) headers.push(`In-Reply-To: ${inReplyTo}`);
      if (references) headers.push(`References: ${references}`);

      // Build email body
      const boundary = '----=_Part_' + Date.now();
      let body = headers.join('\r\n');

      if (html) {
        // Multipart email with text and HTML
        body += `\r\nMIME-Version: 1.0\r\n`;
        body += `Content-Type: multipart/alternative; boundary="${boundary}"\r\n\r\n`;
        body += `--${boundary}\r\n`;
        body += `Content-Type: text/plain; charset=UTF-8\r\n\r\n`;
        body += text || '';
        body += `\r\n\r\n--${boundary}\r\n`;
        body += `Content-Type: text/html; charset=UTF-8\r\n\r\n`;
        body += html;
        body += `\r\n\r\n--${boundary}--`;
      } else {
        // Plain text email
        body += '\r\n\r\n' + text;
      }

      // Encode email as base64url
      const encodedEmail = Buffer.from(body)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

      const params = {
        userId: 'me',
        requestBody: {
          raw: encodedEmail
        }
      };

      // If replying to a thread, include threadId
      if (threadId) {
        params.requestBody.threadId = threadId;
      }

      const result = await this.gmail.users.messages.send(params);

      return {
        id: result.data.id,
        threadId: result.data.threadId,
        labelIds: result.data.labelIds
      };
    } catch (error) {
      console.error('Failed to send email:', error);
      throw new Error('Failed to send email: ' + error.message);
    }
  }

  async deleteEmail(emailId, permanent = false) {
    if (!this.gmail) {
      throw new Error('Gmail not authenticated');
    }

    try {
      if (permanent) {
        // Permanently delete
        await this.gmail.users.messages.delete({
          userId: 'me',
          id: emailId
        });
      } else {
        // Move to trash
        await this.gmail.users.messages.trash({
          userId: 'me',
          id: emailId
        });
      }

      return { success: true, id: emailId, permanent };
    } catch (error) {
      console.error('Failed to delete email:', error);
      throw new Error('Failed to delete email');
    }
  }

  async replyToEmail(emailId, text, html) {
    if (!this.gmail) {
      throw new Error('Gmail not authenticated');
    }

    try {
      // Get the original email to extract headers
      const originalEmail = await this.getEmailById(emailId);

      // Extract the original sender's email from "From" header
      const toMatch = originalEmail.from.match(/<(.+?)>/) || [null, originalEmail.from];
      const to = toMatch[1];

      // Build subject with "Re: " prefix if not already present
      let subject = originalEmail.subject;
      if (!subject.toLowerCase().startsWith('re:')) {
        subject = 'Re: ' + subject;
      }

      // Extract Message-ID for threading
      const messageIdHeader = `<${originalEmail.id}@mail.gmail.com>`;

      // Send the reply
      return await this.sendEmail({
        to,
        subject,
        text,
        html,
        threadId: originalEmail.threadId,
        inReplyTo: messageIdHeader,
        references: messageIdHeader
      });
    } catch (error) {
      console.error('Failed to reply to email:', error);
      throw new Error('Failed to reply to email');
    }
  }

  async summarizeEmails(emails) {
    // Simple summarization - can be enhanced with AI
    const summary = {
      total: emails.length,
      senders: [...new Set(emails.map(e => e.from))],
      subjects: emails.map(e => e.subject),
      unread: emails.filter(e => e.labelIds?.includes('UNREAD')).length,
      important: emails.filter(e => e.labelIds?.includes('IMPORTANT')).length,
      recent: emails.filter(e => {
        const emailDate = new Date(e.date);
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        return emailDate > oneDayAgo;
      }).length
    };

    return summary;
  }

  async createCalendarEvent({ summary, description, start, end, timezone, attendees, location, reminders }) {
    if (!this.calendar) {
      throw new Error('Calendar not authenticated');
    }

    try {
      // Build start object
      const startObj = {};
      if (start.dateTime) {
        startObj.dateTime = start.dateTime;
        startObj.timeZone = timezone || 'America/Los_Angeles';
      } else if (start.date) {
        startObj.date = start.date;
      } else {
        throw new Error('Start date/dateTime is required');
      }

      // Build end object
      const endObj = {};
      if (end.dateTime) {
        endObj.dateTime = end.dateTime;
        endObj.timeZone = timezone || 'America/Los_Angeles';
      } else if (end.date) {
        endObj.date = end.date;
      } else {
        throw new Error('End date/dateTime is required');
      }

      const event = {
        summary,
        description,
        location,
        start: startObj,
        end: endObj
      };

      // Add attendees if provided
      if (attendees && attendees.length > 0) {
        event.attendees = attendees.map(email => ({ email }));
      }

      // Add reminders if provided
      if (reminders) {
        event.reminders = {
          useDefault: false,
          overrides: reminders
        };
      } else {
        event.reminders = {
          useDefault: true
        };
      }

      const result = await this.calendar.events.insert({
        calendarId: 'primary',
        requestBody: event
      });

      return {
        id: result.data.id,
        htmlLink: result.data.htmlLink,
        summary: result.data.summary,
        start: result.data.start,
        end: result.data.end
      };
    } catch (error) {
      console.error('Failed to create calendar event:', error);
      throw new Error('Failed to create calendar event: ' + error.message);
    }
  }

  async listCalendarEvents({ timeMin, timeMax, maxResults = 10, query }) {
    if (!this.calendar) {
      throw new Error('Calendar not authenticated');
    }

    try {
      const params = {
        calendarId: 'primary',
        timeMin: timeMin || new Date().toISOString(),
        timeMax: timeMax,
        maxResults,
        singleEvents: true,
        orderBy: 'startTime'
      };

      if (query) {
        params.q = query;
      }

      const response = await this.calendar.events.list(params);

      if (!response.data.items) {
        return [];
      }

      return response.data.items.map(event => ({
        id: event.id,
        summary: event.summary,
        description: event.description,
        start: event.start,
        end: event.end,
        location: event.location,
        attendees: event.attendees,
        htmlLink: event.htmlLink,
        status: event.status
      }));
    } catch (error) {
      console.error('Failed to list calendar events:', error);
      throw new Error('Failed to list calendar events');
    }
  }

  async addActionItemToCalendar(actionItem, dueDate, priority = 'medium') {
    // Create a calendar event for an action item
    const reminderMinutes = priority === 'high' ? [60, 1440] : [1440]; // 1 hour and 1 day for high, just 1 day for others

    const start = new Date(dueDate);
    const end = new Date(start.getTime() + 30 * 60000); // 30 minutes duration

    return await this.createCalendarEvent({
      summary: `📋 Action: ${actionItem}`,
      description: `Priority: ${priority}\n\nAction item created by Ti-Sang voice assistant.`,
      start: { dateTime: start.toISOString() },
      end: { dateTime: end.toISOString() },
      reminders: reminderMinutes.map(minutes => ({ method: 'popup', minutes }))
    });
  }
}

export default GmailService;
