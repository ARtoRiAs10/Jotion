/**
 * A tiny formula engine for database properties.
 *
 * It supports the subset of Notion formulas that makes sense for a
 * self-hosted clone:
 *
 *   prop("Price") * 2
 *   concat(prop("First name"), " ", prop("Last name"))
 *   if(prop("Done") == 1, "Shipped", "In progress")
 *   lower(prop("Title")) & " — " & upper(prop("Code"))
 *
 * Values are numbers, strings, booleans or null.
 */

export type FormulaValue = number | string | boolean | null;

type TokenType =
  | "number"
  | "string"
  | "identifier"
  | "operator"
  | "leftParen"
  | "rightParen"
  | "comma"
  | "eof";

interface Token {
  type: TokenType;
  value: string;
}

const OPERATORS = [
  "&&",
  "||",
  "==",
  "!=",
  ">=",
  "<=",
  "+",
  "-",
  "*",
  "/",
  "%",
  "&",
  ">",
  "<",
  "!",
];

const tokenize = (input: string): Token[] => {
  const tokens: Token[] = [];
  let index = 0;

  while (index < input.length) {
    const char = input[index];

    if (/\s/.test(char)) {
      index += 1;
      continue;
    }

    if (/[0-9]/.test(char) || (char === "." && /[0-9]/.test(input[index + 1]))) {
      let value = "";
      while (index < input.length && /[0-9.]/.test(input[index])) {
        value += input[index];
        index += 1;
      }
      tokens.push({ type: "number", value });
      continue;
    }

    if (char === '"' || char === "'") {
      const quote = char;
      let value = "";
      index += 1;
      while (index < input.length && input[index] !== quote) {
        if (input[index] === "\\" && index + 1 < input.length) {
          index += 1;
        }
        value += input[index];
        index += 1;
      }
      index += 1;
      tokens.push({ type: "string", value });
      continue;
    }

    if (/[a-zA-Z_]/.test(char)) {
      let value = "";
      while (index < input.length && /[a-zA-Z0-9_]/.test(input[index])) {
        value += input[index];
        index += 1;
      }
      tokens.push({ type: "identifier", value });
      continue;
    }

    if (char === "(") {
      tokens.push({ type: "leftParen", value: char });
      index += 1;
      continue;
    }

    if (char === ")") {
      tokens.push({ type: "rightParen", value: char });
      index += 1;
      continue;
    }

    if (char === ",") {
      tokens.push({ type: "comma", value: char });
      index += 1;
      continue;
    }

    const operator = OPERATORS.find((candidate) =>
      input.startsWith(candidate, index),
    );
    if (operator) {
      tokens.push({ type: "operator", value: operator });
      index += operator.length;
      continue;
    }

    throw new Error(`Unexpected character "${char}" in formula`);
  }

  tokens.push({ type: "eof", value: "" });
  return tokens;
};

const toNumber = (value: FormulaValue): number => {
  if (typeof value === "number") return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value === null || value === undefined) return 0;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const isTruthy = (value: FormulaValue): boolean => {
  if (value === null || value === undefined) return false;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  return value !== "";
};

const toText = (value: FormulaValue): string => {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  return value;
};

class Parser {
  private position = 0;

  constructor(
    private readonly tokens: Token[],
    private readonly scope: Record<string, FormulaValue>,
  ) {}

  private peek(): Token {
    return this.tokens[this.position];
  }

  private next(): Token {
    const token = this.tokens[this.position];
    this.position += 1;
    return token;
  }

  private expect(type: TokenType) {
    const token = this.next();
    if (token.type !== type) {
      throw new Error(`Expected ${type} but found "${token.value}"`);
    }
    return token;
  }

  parse(): FormulaValue {
    const value = this.parseExpression();
    if (this.peek().type !== "eof") {
      throw new Error(`Unexpected token "${this.peek().value}"`);
    }
    return value;
  }

  private parseExpression(): FormulaValue {
    let left = this.parseComparison();
    while (this.peek().type === "operator" && ["&&", "||"].includes(this.peek().value)) {
      const operator = this.next().value;
      const right = this.parseComparison();
      if (operator === "&&") {
        left = isTruthy(left) && isTruthy(right);
      } else {
        left = isTruthy(left) || isTruthy(right);
      }
    }
    return left;
  }

  private parseComparison(): FormulaValue {
    let left = this.parseAdditive();
    while (
      this.peek().type === "operator" &&
      [">", "<", ">=", "<=", "==", "!="].includes(this.peek().value)
    ) {
      const operator = this.next().value;
      const right = this.parseAdditive();
      const a = typeof left === "string" ? left : toNumber(left);
      const b = typeof right === "string" ? right : toNumber(right);
      switch (operator) {
        case ">":
          left = a > b;
          break;
        case "<":
          left = a < b;
          break;
        case ">=":
          left = a >= b;
          break;
        case "<=":
          left = a <= b;
          break;
        case "==":
          left = a === b;
          break;
        case "!=":
          left = a !== b;
          break;
      }
    }
    return left;
  }

  private parseAdditive(): FormulaValue {
    let left = this.parseMultiplicative();
    while (this.peek().type === "operator" && ["+", "-", "&"].includes(this.peek().value)) {
      const operator = this.next().value;
      const right = this.parseMultiplicative();
      if (operator === "+") {
        left =
          typeof left === "string" || typeof right === "string"
            ? toText(left) + toText(right)
            : toNumber(left) + toNumber(right);
      } else if (operator === "-") {
        left = toNumber(left) - toNumber(right);
      } else {
        left = toText(left) + toText(right);
      }
    }
    return left;
  }

  private parseMultiplicative(): FormulaValue {
    let left = this.parseUnary();
    while (
      this.peek().type === "operator" &&
      ["*", "/", "%"].includes(this.peek().value)
    ) {
      const operator = this.next().value;
      const right = this.parseUnary();
      if (operator === "*") {
        left = toNumber(left) * toNumber(right);
      } else if (operator === "/") {
        const divisor = toNumber(right);
        left = divisor === 0 ? 0 : toNumber(left) / divisor;
      } else {
        const divisor = toNumber(right);
        left = divisor === 0 ? 0 : toNumber(left) % divisor;
      }
    }
    return left;
  }

  private parseUnary(): FormulaValue {
    if (this.peek().type === "operator" && this.peek().value === "-") {
      this.next();
      return -toNumber(this.parseUnary());
    }
    if (this.peek().type === "operator" && this.peek().value === "!") {
      this.next();
      return !toNumber(this.parseUnary());
    }
    return this.parsePrimary();
  }

  private parsePrimary(): FormulaValue {
    const token = this.next();

    if (token.type === "number") return Number(token.value);
    if (token.type === "string") return token.value;
    if (token.type === "leftParen") {
      const value = this.parseExpression();
      this.expect("rightParen");
      return value;
    }

    if (token.type === "identifier") {
      if (token.value === "true") return true;
      if (token.value === "false") return false;
      if (token.value === "null") return null;

      // A function call.
      if (this.peek().type === "leftParen") {
        this.next();
        const args: FormulaValue[] = [];
        if (this.peek().type !== "rightParen") {
          for (;;) {
            args.push(this.parseExpression());
            if (this.peek().type === "comma") {
              this.next();
              continue;
            }
            break;
          }
        }
        this.expect("rightParen");
        return this.callFunction(token.value, args);
      }

      // A property reference — either prop("Name") style is handled above,
      // a bare identifier is looked up in the scope.
      if (token.value in this.scope) return this.scope[token.value];
      const lowered = token.value.toLowerCase();
      if (lowered in this.scope) return this.scope[lowered];
      return null;
    }

    throw new Error(`Unexpected token "${token.value}"`);
  }

  private callFunction(name: string, args: FormulaValue[]): FormulaValue {
    switch (name.toLowerCase()) {
      case "prop":
      case "property": {
        const key = toText(args[0]);
        if (key in this.scope) return this.scope[key];
        const lowered = key.toLowerCase();
        for (const [scopeKey, scopeValue] of Object.entries(this.scope)) {
          if (scopeKey.toLowerCase() === lowered) return scopeValue;
        }
        return null;
      }
      case "if":
        return toNumber(args[0]) ? (args[1] ?? null) : (args[2] ?? null);
      case "concat":
        return args.map((arg) => toText(arg)).join("");
      case "number":
        return toNumber(args[0]);
      case "string":
      case "text":
        return toText(args[0]);
      case "lower":
        return toText(args[0]).toLowerCase();
      case "upper":
        return toText(args[0]).toUpperCase();
      case "length":
        return toText(args[0]).length;
      case "contains":
        return toText(args[0])
          .toLowerCase()
          .includes(toText(args[1]).toLowerCase());
      case "startswith":
        return toText(args[0])
          .toLowerCase()
          .startsWith(toText(args[1]).toLowerCase());
      case "endswith":
        return toText(args[0])
          .toLowerCase()
          .endsWith(toText(args[1]).toLowerCase());
      case "empty":
        return args[0] === null || args[0] === undefined || toText(args[0]) === "";
      case "notempty":
        return !(
          args[0] === null ||
          args[0] === undefined ||
          toText(args[0]) === ""
        );
      case "now":
        return Date.now();
      case "date":
        return new Date(toNumber(args[0])).toISOString().slice(0, 10);
      case "year":
        return new Date(toNumber(args[0])).getFullYear();
      case "month":
        return new Date(toNumber(args[0])).getMonth() + 1;
      case "day":
        return new Date(toNumber(args[0])).getDate();
      case "round":
        return Math.round(toNumber(args[0]));
      case "floor":
        return Math.floor(toNumber(args[0]));
      case "ceil":
        return Math.ceil(toNumber(args[0]));
      case "abs":
        return Math.abs(toNumber(args[0]));
      case "sum": {
        let total = 0;
        for (const arg of args) total += toNumber(arg);
        return total;
      }
      case "min":
        return Math.min(...args.map((arg) => toNumber(arg)));
      case "max":
        return Math.max(...args.map((arg) => toNumber(arg)));
      default:
        throw new Error(`Unknown function "${name}"`);
    }
  }
}

/**
 * Evaluates a formula expression against a scope of property values.
 * Never throws — invalid formulas evaluate to `null`.
 */
export const evaluateFormula = (
  expression: string,
  scope: Record<string, FormulaValue>,
): FormulaValue => {
  if (!expression || !expression.trim()) return null;
  try {
    return new Parser(tokenize(expression), scope).parse();
  } catch {
    return null;
  }
};

/** Validates an expression, returning an error message when it is broken. */
export const validateFormula = (
  expression: string,
): { valid: boolean; error?: string } => {
  if (!expression || !expression.trim()) {
    return { valid: false, error: "The formula is empty" };
  }
  try {
    new Parser(tokenize(expression), {}).parse();
    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : "Invalid formula",
    };
  }
};
