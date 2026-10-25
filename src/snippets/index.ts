import type { HttpRequest } from '../core/types'
import { goNative } from './targets/go'
import { javascriptFetch, nodeAxios } from './targets/javascript'
import { javaHttpClient, kotlinOkHttp } from './targets/jvm'
import { phpGuzzle, phpLaravel } from './targets/php'
import { pythonRequests } from './targets/python'
import { curl, httpRaw, powershell } from './targets/shell'
import { csharpHttpClient, swiftUrlSession } from './targets/dotnet-swift'

export type SnippetTarget =
  | 'curl'
  | 'javascript-fetch'
  | 'node-axios'
  | 'php-guzzle'
  | 'php-laravel'
  | 'python-requests'
  | 'go-native'
  | 'java-httpclient'
  | 'csharp-httpclient'
  | 'kotlin-okhttp'
  | 'swift-urlsession'
  | 'http-raw'
  | 'powershell'

export interface SnippetTargetInfo {
  id: SnippetTarget
  label: string
  /** Language id for syntax highlighting. */
  language: string
}

export const SNIPPET_TARGETS: SnippetTargetInfo[] = [
  { id: 'curl', label: 'cURL', language: 'bash' },
  { id: 'javascript-fetch', label: 'JavaScript (fetch)', language: 'javascript' },
  { id: 'node-axios', label: 'Node.js (axios)', language: 'javascript' },
  { id: 'php-guzzle', label: 'PHP (Guzzle)', language: 'php' },
  { id: 'php-laravel', label: 'PHP (Laravel Http)', language: 'php' },
  { id: 'python-requests', label: 'Python (requests)', language: 'python' },
  { id: 'go-native', label: 'Go (net/http)', language: 'go' },
  { id: 'java-httpclient', label: 'Java (HttpClient)', language: 'java' },
  { id: 'csharp-httpclient', label: 'C# (HttpClient)', language: 'csharp' },
  { id: 'kotlin-okhttp', label: 'Kotlin (OkHttp)', language: 'kotlin' },
  { id: 'swift-urlsession', label: 'Swift (URLSession)', language: 'swift' },
  { id: 'http-raw', label: 'HTTP', language: 'http' },
  { id: 'powershell', label: 'PowerShell', language: 'powershell' },
]

const GENERATORS: Record<SnippetTarget, (request: HttpRequest) => string> = {
  curl,
  'javascript-fetch': javascriptFetch,
  'node-axios': nodeAxios,
  'php-guzzle': phpGuzzle,
  'php-laravel': phpLaravel,
  'python-requests': pythonRequests,
  'go-native': goNative,
  'java-httpclient': javaHttpClient,
  'csharp-httpclient': csharpHttpClient,
  'kotlin-okhttp': kotlinOkHttp,
  'swift-urlsession': swiftUrlSession,
  'http-raw': httpRaw,
  powershell,
}

/**
 * Prints the request as runnable code for the target. File fields refer to
 * the file by its name (a path next to the script); query is part of the URL.
 */
export function generateSnippet(target: SnippetTarget, request: HttpRequest): string {
  const generate = GENERATORS[target]
  if (!generate) throw new Error(`Unknown snippet target: ${String(target)}`)
  return generate(request)
}
