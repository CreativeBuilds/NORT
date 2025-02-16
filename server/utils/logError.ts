export function logError(args) {
    if (args.length > 0) console.error(args[args.length - 1]);
    return [...args];
}
