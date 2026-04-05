interface ClawConfig {
  apiBase: string;
  streamBase: string;
}

const defaults: ClawConfig = {
  apiBase: "https://j4mihzi30d.execute-api.us-east-1.amazonaws.com",
  streamBase: "http://claw-code-alb-1949663679.us-east-1.elb.amazonaws.com",
};

// In Electron, preload.js injects __CLAW_CONFIG__ with local backend URL.
// On the web, it falls back to the AWS endpoints.
export const config: ClawConfig =
  (window as unknown as { __CLAW_CONFIG__?: ClawConfig }).__CLAW_CONFIG__ || defaults;
