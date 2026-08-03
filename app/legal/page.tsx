import type { Metadata } from "next";
import { LegalDoc } from "@/components/legal-doc";
import {
  AUTHOR_KINGDOM,
  AUTHOR_NAME,
  AUTHOR_NICK,
  BRAND,
  CONTACT_EMAIL,
  EVENT_NAME,
  GAME_NAME,
  GAME_PUBLISHER,
  PROJECT_NAME,
  SITE_DOMAIN,
} from "@/lib/constants";

export const metadata: Metadata = {
  title: `Legal notice · ${PROJECT_NAME}`,
  description: `Legal notice for ${PROJECT_NAME} (${BRAND}).`,
};

const UPDATED = "3 August 2026";

export default function LegalPage() {
  return (
    <LegalDoc title="Legal notice" updated={UPDATED}>
      <p>
        This page identifies the publisher of{" "}
        <strong>{PROJECT_NAME}</strong> (the “Service”), available at{" "}
        <strong>https://{SITE_DOMAIN}</strong> under the{" "}
        <strong>{BRAND}</strong> brand, with HTTPS encryption.
      </p>

      <h2>1. Publisher</h2>
      <ul>
        <li>
          <strong>Name:</strong> {AUTHOR_NAME}
        </li>
        <li>
          <strong>In-game identity:</strong> {AUTHOR_NICK} ({AUTHOR_KINGDOM} —
          Kingdom 6)
        </li>
        <li>
          <strong>Status:</strong> natural person, private individual (player),
          not acting as a professional trader for this Service
        </li>
        <li>
          <strong>Country:</strong> France
        </li>
        <li>
          <strong>Contact:</strong>{" "}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </li>
      </ul>
      <p>
        For privacy reasons, a full postal address is not published on this
        page. You can reach the publisher at the email above; a physical address
        can be provided to competent authorities when required by law.
      </p>

      <h2>2. Hosting</h2>
      <ul>
        <li>
          <strong>Provider:</strong> DigitalOcean, LLC
        </li>
        <li>
          <strong>Address:</strong> 101 Avenue of the Americas, 10th Floor, New
          York, NY 10013, United States
        </li>
        <li>
          <strong>Website:</strong>{" "}
          <a
            href="https://www.digitalocean.com"
            target="_blank"
            rel="noopener noreferrer"
          >
            https://www.digitalocean.com
          </a>
        </li>
      </ul>
      <p>
        The Service runs on a server (VPS / droplet) operated via DigitalOcean.
        The domain name used is <strong>{SITE_DOMAIN}</strong>.
      </p>

      <h2>3. Nature of the Service</h2>
      <p>
        {PROJECT_NAME} is an <strong>unofficial fan-made tool</strong> for
        alliance officers and helpers who monitor the in-game{" "}
        <strong>{EVENT_NAME}</strong> event in <strong>{GAME_NAME}</strong>.
      </p>
      <ul>
        <li>
          Map ownership, shields and related status are entered{" "}
          <strong>manually</strong> by invited helpers and officers (players
          chosen for that role).
        </li>
        <li>
          The Service has <strong>no direct access</strong> to the game
          publisher’s servers or official APIs. Nothing is scraped or synced
          automatically from the live game.
        </li>
        <li>
          The Service is provided free of charge for coordination among
          players. Optional tips (for example via Ko-fi) are external and not a
          sale of digital content on this site.
        </li>
      </ul>

      <h2>4. No affiliation</h2>
      <p>
        The publisher is a player and is{" "}
        <strong>
          not affiliated with, endorsed by, or sponsored by {GAME_PUBLISHER}
        </strong>{" "}
        or any other rights holder of {GAME_NAME}. All game names, marks and
        assets remain the property of their respective owners. This site does
        not host official game art or assets from the publisher.
      </p>

      <h2>5. Related documents</h2>
      <ul>
        <li>
          <a href="/privacy">Privacy policy</a>
        </li>
        <li>
          <a href="/terms">Terms of use</a>
        </li>
      </ul>
    </LegalDoc>
  );
}
