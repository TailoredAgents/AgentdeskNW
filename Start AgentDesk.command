#!/bin/zsh -l
cd -- "${0:A:h}"
print 'Starting AgentDesk. Open http://127.0.0.1:3000 after the Ready message.'
print 'Keep this window open while using the app. Press Control-C to stop.'
exec npm run dev
