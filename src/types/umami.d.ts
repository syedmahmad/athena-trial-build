// Umami analytics tracker — global injected by the tracker <script>.
// Loaded asynchronously, so it is optional until the script has run.
interface Window {
  umami?: {
    identify: (id: string, data?: Record<string, string>) => void;
    track: (eventName?: string, eventData?: Record<string, unknown>) => void;
  };
}
