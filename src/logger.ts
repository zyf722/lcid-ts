type ConsoleLevel = "log" | "info" | "error" | "warn";
export class Logger {
    name: string;

    constructor(name: string) {
        this.name = name;
    }

    format(level: ConsoleLevel, messages: any[]): void {
        console[level](`[${level}] ${this.name}: `, ...messages);
    }

    debug(...messages: any[]): void {
        this.format("log", messages);
    }

    info(...messages: any[]): void {
        this.format("info", messages);
    }

    error(...messages: any[]): void {
        this.format("error", messages);
    }

    warn(...messages: any[]): void {
        this.format("warn", messages);
    }
}
