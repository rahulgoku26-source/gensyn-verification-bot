const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 32;
const KEY_LENGTH = 32;
const ITERATIONS = 100000;

class SecurityService {
  constructor() {
    this.masterPassword = null;
    this.derivedKey = null;
    this.autoLockTimeout = 5 * 60 * 1000; // 5 minutes
    this.lastActivity = Date.now();
    this.lockTimer = null;
  }

  /**
   * Get the configured master password
   */
  getConfiguredPassword() {
    return process.env.MASTER_PASSWORD || null;
  }

  /**
   * Derive encryption key from password
   */
  deriveKey(password, salt) {
    return crypto.pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, 'sha256');
  }

  /**
   * Encrypt data with AES-256-GCM
   * @param {string} plaintext - Data to encrypt
   * @param {string} password - Password for encryption
   * @returns {string} - Encrypted data as base64 string
   */
  encrypt(plaintext, password = this.masterPassword) {
    if (!password) {
      throw new Error('No password provided for encryption');
    }

    const salt = crypto.randomBytes(SALT_LENGTH);
    const iv = crypto.randomBytes(IV_LENGTH);
    const key = this.deriveKey(password, salt);

    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();

    // Combine salt + iv + authTag + encrypted data
    const combined = Buffer.concat([
      salt,
      iv,
      authTag,
      Buffer.from(encrypted, 'hex')
    ]);

    return combined.toString('base64');
  }

  /**
   * Decrypt data with AES-256-GCM
   * @param {string} encryptedData - Base64 encrypted data
   * @param {string} password - Password for decryption
   * @returns {string} - Decrypted plaintext
   */
  decrypt(encryptedData, password = this.masterPassword) {
    if (!password) {
      throw new Error('No password provided for decryption');
    }

    try {
      const combined = Buffer.from(encryptedData, 'base64');

      const salt = combined.subarray(0, SALT_LENGTH);
      const iv = combined.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
      const authTag = combined.subarray(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH);
      const encrypted = combined.subarray(SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH);

      const key = this.deriveKey(password, salt);

      const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(encrypted.toString('hex'), 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error) {
      throw new Error('Decryption failed - incorrect password or corrupted data');
    }
  }

  /**
   * Encrypt a file
   * @param {string} filePath - Path to the file
   * @param {string} password - Password for encryption
   */
  encryptFile(filePath, password = this.masterPassword) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const encrypted = this.encrypt(content, password);
    
    const encryptedPath = filePath + '.enc';
    fs.writeFileSync(encryptedPath, encrypted);
    
    return encryptedPath;
  }

  /**
   * Decrypt a file
   * @param {string} encryptedPath - Path to the encrypted file
   * @param {string} password - Password for decryption
   * @returns {string} - Decrypted content
   */
  decryptFile(encryptedPath, password = this.masterPassword) {
    if (!fs.existsSync(encryptedPath)) {
      throw new Error(`Encrypted file not found: ${encryptedPath}`);
    }

    const encrypted = fs.readFileSync(encryptedPath, 'utf8');
    return this.decrypt(encrypted, password);
  }

  /**
   * Encrypt and save JSON data
   * @param {string} filePath - Path to save the file
   * @param {Object} data - Data to encrypt and save
   * @param {string} password - Password for encryption
   */
  saveEncryptedJson(filePath, data, password = this.masterPassword) {
    const jsonString = JSON.stringify(data, null, 2);
    const encrypted = this.encrypt(jsonString, password);
    
    // Ensure directory exists
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    fs.writeFileSync(filePath, encrypted);
  }

  /**
   * Load and decrypt JSON data
   * @param {string} filePath - Path to the encrypted file
   * @param {string} password - Password for decryption
   * @returns {Object} - Decrypted JSON data
   */
  loadEncryptedJson(filePath, password = this.masterPassword) {
    if (!fs.existsSync(filePath)) {
      return null;
    }

    const encrypted = fs.readFileSync(filePath, 'utf8');
    
    // Check if file is encrypted (base64 encoded)
    try {
      const decrypted = this.decrypt(encrypted, password);
      return JSON.parse(decrypted);
    } catch (error) {
      // If decryption fails, try parsing as plain JSON (for migration)
      try {
        return JSON.parse(encrypted);
      } catch (parseError) {
        throw new Error('Failed to load file - incorrect password or corrupted data');
      }
    }
  }

  /**
   * Append encrypted log entry
   * @param {string} filePath - Path to the log file
   * @param {string} logEntry - Log entry to append
   * @param {string} password - Password for encryption
   */
  appendEncryptedLog(filePath, logEntry, password = this.masterPassword) {
    let logs = [];
    
    if (fs.existsSync(filePath)) {
      try {
        const encrypted = fs.readFileSync(filePath, 'utf8');
        const decrypted = this.decrypt(encrypted, password);
        logs = decrypted.split('\n').filter(line => line.trim());
      } catch (error) {
        // If file exists but can't be decrypted, try reading as plain text
        try {
          const content = fs.readFileSync(filePath, 'utf8');
          logs = content.split('\n').filter(line => line.trim());
        } catch (e) {
          logs = [];
        }
      }
    }

    logs.push(logEntry);
    
    // Ensure directory exists
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    const content = logs.join('\n');
    const encrypted = this.encrypt(content, password);
    fs.writeFileSync(filePath, encrypted);
  }

  /**
   * Read encrypted log file
   * @param {string} filePath - Path to the log file
   * @param {string} password - Password for decryption
   * @returns {Array<string>} - Array of log entries
   */
  readEncryptedLog(filePath, password = this.masterPassword) {
    if (!fs.existsSync(filePath)) {
      return [];
    }

    try {
      const encrypted = fs.readFileSync(filePath, 'utf8');
      const decrypted = this.decrypt(encrypted, password);
      return decrypted.split('\n').filter(line => line.trim());
    } catch (error) {
      // Try reading as plain text
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        return content.split('\n').filter(line => line.trim());
      } catch (e) {
        return [];
      }
    }
  }

  /**
   * Mask sensitive data in console output
   * @param {string} text - Text that might contain sensitive data
   * @returns {string} - Text with masked sensitive data
   */
  maskSensitiveData(text) {
    if (!text) return text;
    
    // Mask Discord tokens
    text = text.replace(/[A-Za-z0-9_-]{24}\.[A-Za-z0-9_-]{6}\.[A-Za-z0-9_-]{27}/g, '****TOKEN****');
    
    // Mask wallet addresses (keep first 6 and last 4 characters)
    text = text.replace(/0x[a-fA-F0-9]{40}/g, (match) => {
      return `${match.substring(0, 6)}...${match.substring(38)}`;
    });
    
    // Mask API keys
    text = text.replace(/[A-Za-z0-9_-]{32,}/g, '****API_KEY****');
    
    return text;
  }

  /**
   * Prompt for password in terminal
   * @returns {Promise<string>} - The entered password
   */
  promptPassword() {
    return new Promise((resolve) => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });

      // Disable echo for password input (works in some terminals)
      if (process.stdin.isTTY) {
        process.stdout.write('🔐 Enter master password: ');
        
        let password = '';
        
        process.stdin.setRawMode(true);
        process.stdin.resume();
        process.stdin.setEncoding('utf8');
        
        const onData = (char) => {
          if (char === '\n' || char === '\r') {
            process.stdin.setRawMode(false);
            process.stdin.removeListener('data', onData);
            process.stdout.write('\n');
            rl.close();
            resolve(password);
          } else if (char === '\u0003') {
            // Ctrl+C
            process.exit();
          } else if (char === '\u007f' || char === '\b') {
            // Backspace
            if (password.length > 0) {
              password = password.slice(0, -1);
              process.stdout.write('\b \b');
            }
          } else {
            password += char;
            process.stdout.write('*');
          }
        };
        
        process.stdin.on('data', onData);
      } else {
        // Non-TTY mode (e.g., when running with PM2)
        rl.question('🔐 Enter master password: ', (answer) => {
          rl.close();
          resolve(answer);
        });
      }
    });
  }

  /**
   * Verify password against configured password
   * @param {string} password - Password to verify
   * @returns {boolean} - True if password matches
   */
  verifyPassword(password) {
    const configuredPassword = this.getConfiguredPassword();
    
    if (!configuredPassword) {
      // No password configured, skip verification
      return true;
    }
    
    return password === configuredPassword;
  }

  /**
   * Initialize security with password verification
   * @returns {Promise<boolean>} - True if security initialized successfully
   */
  async initialize() {
    const configuredPassword = this.getConfiguredPassword();
    
    if (!configuredPassword) {
      console.log('⚠️  No master password configured. Running without encryption.');
      return true;
    }

    console.log('');
    console.log('═══════════════════════════════════════════════════════');
    console.log('        🔐 SECURITY VERIFICATION REQUIRED');
    console.log('═══════════════════════════════════════════════════════');
    console.log('');

    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
      const enteredPassword = await this.promptPassword();
      
      if (this.verifyPassword(enteredPassword)) {
        this.masterPassword = enteredPassword;
        this.derivedKey = this.deriveKey(enteredPassword, Buffer.alloc(SALT_LENGTH, 0));
        console.log('');
        console.log('✅ Security verification successful!');
        console.log('');
        
        // Start auto-lock timer
        this.startAutoLock();
        
        return true;
      }
      
      attempts++;
      console.log(`❌ Incorrect password. ${maxAttempts - attempts} attempts remaining.`);
    }

    console.log('');
    console.log('❌ Too many failed attempts. Exiting...');
    return false;
  }

  /**
   * Start auto-lock timer
   */
  startAutoLock() {
    if (this.lockTimer) {
      clearInterval(this.lockTimer);
    }
    
    this.lockTimer = setInterval(() => {
      const inactiveTime = Date.now() - this.lastActivity;
      if (inactiveTime >= this.autoLockTimeout) {
        this.lock();
      }
    }, 60000); // Check every minute
  }

  /**
   * Update last activity timestamp
   */
  updateActivity() {
    this.lastActivity = Date.now();
  }

  /**
   * Lock the security (clear password from memory)
   */
  lock() {
    this.masterPassword = null;
    this.derivedKey = null;
    console.log('🔒 Security auto-locked due to inactivity.');
  }

  /**
   * Check if security is unlocked
   */
  isUnlocked() {
    return this.masterPassword !== null;
  }

  /**
   * Hash a value (for non-reversible storage)
   * @param {string} value - Value to hash
   * @returns {string} - SHA-256 hash
   */
  hash(value) {
    return crypto.createHash('sha256').update(value).digest('hex');
  }

  /**
   * Generate a random secure token
   * @param {number} length - Length of the token
   * @returns {string} - Random token
   */
  generateToken(length = 32) {
    return crypto.randomBytes(length).toString('hex');
  }
}

module.exports = new SecurityService();
