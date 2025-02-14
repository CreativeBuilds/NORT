// automated version of @think.js
import fs from 'fs'
import { sendGreetings } from './chat/SendGreetings';




// Initialize prompt
try {
    if (!fs.existsSync('./.prompts/VI_BASE.txt')) {
        throw new Error("")
    }
    let prompt = fs.readFileSync('./.prompts/VI_BASE.txt', 'utf8');
    if (!fs.existsSync('./.prompts/VI_CONTINUED.txt')) {
        fs.writeFileSync('./.prompts/VI_CONTINUED.txt', '');
    }
    prompt += fs.readFileSync('./.prompts/VI_CONTINUED.txt', 'utf8');
} catch (_) { }

// Main execution
async function main() {
    let [greeting_to_user, error] = await sendGreetings();
    console.log(greeting_to_user, error)
    return greeting_to_user
}

main().then(console.log)

/**
 * the initial conversation can be broken into steps
 * 
 * 1. Greetings
 * 2. Explaining the App
 * 3. 
 */