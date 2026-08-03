import type { Metadata } from "next";
import { LegalDoc } from "@/components/legal-doc";
import {
  AUTHOR_NAME,
  BRAND,
  CONTACT_EMAIL,
  EVENT_NAME,
  GAME_NAME,
  GAME_PUBLISHER,
  KOFI_URL,
  PROJECT_NAME,
  SITE_DOMAIN,
} from "@/lib/constants";

export const metadata: Metadata = {
  title: `Terms of use · ${PROJECT_NAME}`,
  description: `Terms of use for ${PROJECT_NAME} (${BRAND}).`,
};

const UPDATED = "4 August 2026";

export default function TermsPage() {
  return (
    <LegalDoc title="Terms of use" updated={UPDATED}>
      <p>
        These terms govern access to and use of{" "}
        <strong>{PROJECT_NAME}</strong> (the “Service”) at{" "}
        <strong>https://{SITE_DOMAIN}</strong>, published by{" "}
        <strong>{AUTHOR_NAME}</strong> under the <strong>{BRAND}</strong> brand.
        By using the Service you agree to these terms.
      </p>

      <h2>1. What the Service is</h2>
      <p>
        The Service is an <strong>unofficial fan tool</strong> that helps
        alliance officers and helpers track the <strong>{EVENT_NAME}</strong>{" "}
        conquest map in <strong>{GAME_NAME}</strong>: ownership, shields,
        confirmations, roads and simple statistics.
      </p>
      <ul>
        <li>
          Data is entered <strong>manually</strong> by invited helpers and
          officers. There is <strong>no official API access</strong> and no
          automated pull from the live game servers.
        </li>
        <li>
          Map content can be wrong, incomplete or outdated. Treat it as a
          coordination aid among players, not as an authoritative game source.
        </li>
        <li>
          Guests may view public screens. Editing map status requires an
          invited account with the appropriate role. The{" "}
          <strong>war room</strong> (officer chat, shared capture trails on the
          map, and node notes) is limited to officers and admins.
        </li>
      </ul>

      <h2>2. No affiliation</h2>
      <p>
        The Service is not affiliated with, endorsed by, or sponsored by{" "}
        <strong>{GAME_PUBLISHER}</strong> or any other rights holder of{" "}
        {GAME_NAME}. Game names and marks belong to their owners. Do not assume
        official support or liability from the publisher for anything you do
        with this fan tool.
      </p>

      <h2>3. Accounts and roles</h2>
      <ul>
        <li>
          There is <strong>no open registration</strong>. Accounts are created
          only via one-time invite links issued by an admin or officer.
        </li>
        <li>
          Roles (helper, officer, admin) limit what you may change. Server-side
          checks always apply; hiding a button in the UI is not permission.
        </li>
        <li>
          You must keep your password confidential and use a nickname you are
          allowed to use. Do not share accounts in a way that breaks these terms
          or harms other users.
        </li>
        <li>
          The publisher or admins may disable accounts (instead of deleting
          them) to stop abuse while preserving map history.
        </li>
      </ul>

      <h2>4. Acceptable use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>
          Attempt to break, overload, scrape abusively, or reverse-engineer the
          Service beyond ordinary use of the public interface.
        </li>
        <li>
          Enter deliberately false or harmful data to sabotage other players’
          coordination, except as part of normal in-game rivalry recorded in
          good faith.
        </li>
        <li>
          Upload unlawful content, personal data of third parties without a
          basis, or anything that infringes others’ rights — including in
          war-room chat messages and plan notes on map nodes.
        </li>
        <li>
          Use the war room to harass, spam, or share credentials, invite tokens
          or other secrets that do not belong in a multi-officer channel
          (chat, trails and notes are visible to other officers and admins).
        </li>
        <li>
          Use the Service to violate the game’s own rules or applicable law.
        </li>
        <li>
          Circumvent rate limits, bot checks, invites or role restrictions.
        </li>
      </ul>

      <h2>5. Content and accuracy</h2>
      <p>
        Map nodes, roads, ownership and node notes are community-maintained.
        War-room chat, shared capture trails and plan notes are written by
        officers for coordination; they are stored on the server and visible to
        other officers and admins who can open the room. Trails and “horns” /
        yield estimates are planning aids derived from map data and provisional
        rules — not official game values. The publisher does not warrant that
        any figure, owner, shield timer, buff total or plan total matches the
        live game. You use the map, chat and plan at your own risk for in-game
        decisions.
      </p>

      <h2>6. Intellectual property</h2>
      <ul>
        <li>
          The Service’s own code, layout and original UI elements are provided
          for running this fan project.
        </li>
        <li>
          {GAME_NAME} names, settings and related IP remain with {GAME_PUBLISHER}{" "}
          and other rights holders. This site does not distribute official game
          art assets.
        </li>
        <li>
          Factual map data you enter (coordinates, ownership, timers) is used
          solely to operate the shared map for participants.
        </li>
      </ul>

      <h2>7. Tips and third-party links</h2>
      <p>
        Optional support links (for example{" "}
        <a href={KOFI_URL} target="_blank" rel="noopener noreferrer">
          Ko-fi
        </a>
        ) are external. They are not a purchase of the Service on this site, and
        their own terms and privacy policies apply. The Service itself is free
        to use for viewing and for invited editors.
      </p>

      <h2>8. Availability and changes</h2>
      <p>
        The Service is provided <strong>“as is”</strong> and{" "}
        <strong>“as available”</strong>, without warranty of uptime, fitness for
        a particular purpose, or error-free operation. Features may change,
        pause or stop (for example between events, or if hosting costs or legal
        constraints require it).
      </p>

      <h2>9. Liability</h2>
      <p>
        To the fullest extent permitted by law applicable to a private
        individual running a free fan site in France, the publisher is not
        liable for in-game losses, alliance decisions, data entry mistakes,
        downtime, or third-party services (hosting, Turnstile, Ko-fi, etc.).
        Nothing in these terms excludes liability that cannot be excluded under
        mandatory law.
      </p>

      <h2>10. Privacy</h2>
      <p>
        Personal data is handled as described in the{" "}
        <a href="/privacy">Privacy policy</a>.
      </p>

      <h2>11. Governing law</h2>
      <p>
        These terms are governed by the laws of France, without prejudice to
        mandatory consumer protections that may apply if you qualify as a
        consumer in your country of residence.
      </p>

      <h2>12. Contact</h2>
      <p>
        Questions about these terms:{" "}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. See also the{" "}
        <a href="/legal">Legal notice</a>.
      </p>
    </LegalDoc>
  );
}
