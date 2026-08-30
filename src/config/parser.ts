/**
 * Strip JSONC comments (single line // and block / * ... * /) while preserving strings.
 * Also handles trailing commas in arrays and objects.
 */
export function stripJsonComments(input: string): string {
  let insideString = false;
  let stringQuote = "";
  let isEscaped = false;
  let output = "";
  let i = 0;

  while (i < input.length) {
    const char = input[i];
    const nextChar = i + 1 < input.length ? input[i + 1] : "";

    if (insideString) {
      output += char;
      if (isEscaped) {
        isEscaped = false;
      } else if (char === "\\") {
        isEscaped = true;
      } else if (char === stringQuote) {
        insideString = false;
      }
      i++;
      continue;
    }

    if (char === '"' || char === "'") {
      insideString = true;
      stringQuote = char;
      output += char;
      i++;
      continue;
    }

    // Line comment //
    if (char === "/" && nextChar === "/") {
      while (i < input.length && input[i] !== "\n" && input[i] !== "\r") {
        i++;
      }
      continue;
    }

    // Block comment /* */
    if (char === "/" && nextChar === "*") {
      i += 2;
      while (i < input.length && !(input[i] === "*" && input[i + 1] === "/")) {
        i++;
      }
      i += 2;
      continue;
    }

    output += char;
    i++;
  }

  // Remove trailing commas before } or ]
  return output.replace(/,\s*([\]}])/g, "$1");
}

export function parseJsonc<T = unknown>(input: string): T {
  const stripped = stripJsonComments(input);
  return JSON.parse(stripped) as T;
}
