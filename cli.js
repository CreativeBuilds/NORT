#!/usr/bin/env node
import inquirer from 'inquirer';
import fs from 'fs/promises';
import path from 'path';

const CONFIG_PATH = path.join(process.cwd(), 'settings.json');

async function loadSettings() {
  try {
    const data = await fs.readFile(CONFIG_PATH, 'utf8');
    return JSON.parse(data);
  } catch {
    return {
      maxTokens: 1024,
      seed: Math.floor(Math.random() * Number.MAX_SAFE_INTEGER),
      temperature: 1.1
    };
  }
}

async function saveSettings(settings) {
  await fs.writeFile(CONFIG_PATH, JSON.stringify(settings, null, 2));
}

async function mainMenu() {
  const settings = await loadSettings();
  
  while (true) {
    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'Story Generator Menu',
        choices: [
          { name: 'Generate Story', value: 'generate' },
          { name: 'Modify Settings', value: 'settings' },
          { name: 'Exit', value: 'exit' }
        ]
      }
    ]);

    if (action === 'exit') {
      process.exit(0);
    }
    
    if (action === 'settings') {
      while (true) {
        const { settingChoice } = await inquirer.prompt([
          {
            type: 'list',
            name: 'settingChoice',
            message: 'Which setting would you like to modify?',
            choices: [
              { name: 'Max Tokens', value: 'maxTokens' },
              { name: 'Random Seed', value: 'seed' },
              { name: 'Temperature', value: 'temperature' },
              { name: 'Back', value: 'back' }
            ]
          }
        ]);

        if (settingChoice === 'back') {
          break;
        }

        let prompt = {
          type: settingChoice === 'temperature' ? 'input' : 'number',
          name: 'value',
          message: `Enter new value for ${settingChoice}:`,
          default: settings[settingChoice],
          validate: (input) => {
            if (settingChoice === 'maxTokens') {
              const value = parseInt(input);
              if (isNaN(value) || value <= 0) {
                return 'Max tokens must be a positive number';
              }
              return true;
            }
            if (settingChoice === 'seed') {
              const value = parseInt(input);
              if (isNaN(value)) {
                return 'Seed must be a valid number';
              }
              return true;
            }
            if (settingChoice === 'temperature') {
              const value = parseFloat(input);
              if (isNaN(value)) {
                return 'Please enter a valid number';
              }
              if (value < 0 || value > 2) {
                return 'Temperature should be between 0 and 2';
              }
              return true;
            }
            return true;
          }
        };

        const newValue = await inquirer.prompt([prompt]);
        
        // Convert the value to the appropriate type
        settings[settingChoice] = settingChoice === 'temperature' 
          ? parseFloat(newValue.value)
          : parseInt(newValue.value);
      }
      const newSettings = settings;
      
      await saveSettings(newSettings);
      console.log('Settings saved successfully!');
      continue;
    }

    return settings;
  }
}

const options = await mainMenu();
