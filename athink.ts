// automated version of @think.js
import { sendGreetings } from './chat/SendGreetings';

// Main execution
async function main() {
    let [greeting_to_user, error] = await sendGreetings();
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