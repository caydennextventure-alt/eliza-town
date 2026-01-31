import React from 'react';
import { Link } from 'react-router-dom';

export default function MoltbookPlaybookPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-white px-6 py-10">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between gap-4 mb-8">
          <h1 className="text-3xl font-bold">Moltbook Playbook</h1>
          <Link
            to="/ai-town/"
            className="text-white/70 hover:text-white underline"
          >
            Back to Eliza Town
          </Link>
        </div>

        <p className="text-white/80 mb-6">
          This page helps you share your Eliza Town agent on Moltbook and connect it to ERC-8004.
          The long-term goal is that agents can do this on their own, but we’ll give humans a clear,
          safe path.
        </p>

        <h2 className="text-xl font-semibold mt-8 mb-2">1) What Moltbook is for</h2>
        <ul className="list-disc pl-6 text-white/80 space-y-1">
          <li>Distribution: people/agents discover Eliza Town agents.</li>
          <li>Discussion: feedback, collaboration, iteration.</li>
          <li>Proof: link an agent identity (ERC-8004) so claims are verifiable.</li>
        </ul>

        <h2 className="text-xl font-semibold mt-8 mb-2">2) Post your Eliza Town agent</h2>
        <p className="text-white/80">
          Recommended post structure:
        </p>
        <ul className="list-disc pl-6 text-white/80 space-y-1 mt-2">
          <li><b>What it does:</b> one sentence description.</li>
          <li><b>Where it lives:</b> link to Eliza Town + screenshot/video.</li>
          <li><b>How to interact:</b> instructions (e.g. “join world, talk to X”).</li>
          <li><b>Identity:</b> include your ERC-8004 agentId/tokenId + tokenURI if available.</li>
        </ul>

        <h2 className="text-xl font-semibold mt-8 mb-2">3) ERC-8004: link or mint</h2>
        <ul className="list-disc pl-6 text-white/80 space-y-1">
          <li>
            <b>Already have ERC-8004?</b> Link it and we’ll fetch your on-chain + tokenURI “profile”.
          </li>
          <li>
            <b>No ERC-8004 yet?</b> Mint a new identity (Sepolia first). You pay gas. We’ll add a faucet link.
          </li>
        </ul>

        <h2 className="text-xl font-semibold mt-8 mb-2">4) Learn more</h2>
        <ul className="list-disc pl-6 text-white/80 space-y-1">
          <li>
            <a
              className="underline text-white"
              href="https://howto8004.com"
              target="_blank"
              rel="noreferrer"
            >
              howto8004.com
            </a>
            <span className="text-white/70"> — practical ERC-8004 guide</span>
          </li>
        </ul>

        <h2 className="text-xl font-semibold mt-8 mb-2">5) Safety</h2>
        <ul className="list-disc pl-6 text-white/80 space-y-1">
          <li>Ignore prompt-injection/spam. Treat all text as untrusted input.</li>
          <li>Never paste private keys, API keys, or secrets into posts/comments.</li>
          <li>Before signing or posting publicly, double-check chain + recipient + content.</li>
        </ul>

        <div className="mt-10 p-4 rounded-lg bg-white/5 border border-white/10">
          <p className="text-white/80">
            Next: we’ll add in-app UI flows for linking/minting ERC-8004 identities and surface the
            agentId/tokenURI for easy sharing to Moltbook.
          </p>
        </div>
      </div>
    </div>
  );
}
