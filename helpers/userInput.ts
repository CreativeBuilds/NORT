import * as readline from 'readline';

/**
 * Blocks thread until user submits input via Enter key
 * @returns Tuple containing [user input string | null, error string | null]
 */
export function userInput(): Promise<[string | null, string | null]> {
    return new Promise((resolve) => {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        rl.question('', (input) => {
            rl.close();
            if (!input?.trim()) return resolve([null, 'NO_INPUT']);
            return resolve([input, null]);
        });
    });
}
