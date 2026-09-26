// Run with osascript -l JavaScript bridge.js ACTION [SESSION_ID] [PROMPT].
// Arguments are data, never interpolated into executable script text.
function run(argv) {
  const app = Application('com.googlecode.iterm2');
  if (!app.running()) {
    if (argv[0] === 'list') return '[]';
    throw new Error('iTerm2 is not running.');
  }
  const found = [];
  for (const [wi, window] of app.windows().entries()) {
    for (const [ti, tab] of window.tabs().entries()) {
      for (const [pi, session] of tab.sessions().entries()) {
        const id = session.id();
        if (argv[0] === 'list') {
          found.push({id, name: session.name(), tty: session.tty(), window: wi + 1,
            tab: ti + 1, pane: pi + 1, at_shell: session.isAtShellPrompt()});
        } else if (id === argv[1]) {
          if (argv[0] === 'preview') return JSON.stringify({text: session.contents().slice(-12000)});
          if (argv[0] === 'send') {
            if (session.isAtShellPrompt()) throw new Error('Session is at a shell prompt. Start the agent, then resume the schedule.');
            session.write({text: argv[2], newline: false});
            delay(0.2);
            session.write({text: '\r', newline: false});
            return JSON.stringify({sent: true});
          }
          throw new Error('Unknown action.');
        }
      }
    }
  }
  if (argv[0] === 'list') return JSON.stringify(found);
  throw new Error('The selected session has closed. Choose a current session.');
}
