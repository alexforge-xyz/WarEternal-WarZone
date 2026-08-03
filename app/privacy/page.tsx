import type { Metadata } from "next";
import { LegalDoc } from "@/components/legal-doc";
import {
  AUTHOR_NAME,
  BRAND,
  CONTACT_EMAIL,
  EVENT_NAME,
  GAME_NAME,
  PROJECT_NAME,
  SITE_DOMAIN,
} from "@/lib/constants";

export const metadata: Metadata = {
  title: `Privacy policy · ${PROJECT_NAME}`,
  description: `Privacy policy for ${PROJECT_NAME} (${BRAND}).`,
};

const UPDATED = "4 August 2026";

export default function PrivacyPage() {
  return (
    <LegalDoc title="Privacy policy" updated={UPDATED}>
      <p>
        This privacy policy explains how <strong>{PROJECT_NAME}</strong> (the
        “Service”), published by <strong>{AUTHOR_NAME}</strong> under the{" "}
        <strong>{BRAND}</strong> brand at{" "}
        <strong>https://{SITE_DOMAIN}</strong>, processes personal data.
      </p>
      <p>
        The Service is a fan-made coordination tool for the{" "}
        <strong>{EVENT_NAME}</strong> event in <strong>{GAME_NAME}</strong>. Map
        data is entered by hand; there is no connection to the game’s official
        APIs. Officers may also use an invite-only <strong>war room</strong>:
        chat, shared capture trails on the map, and node notes for planning.
      </p>

      <h2>1. Data controller</h2>
      <ul>
        <li>
          <strong>Controller:</strong> {AUTHOR_NAME} (natural person, France)
        </li>
        <li>
          <strong>Contact:</strong>{" "}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </li>
      </ul>

      <h2>2. What we process</h2>
      <p>Depending on how you use the Service, we may process:</p>
      <ul>
        <li>
          <strong>Account data</strong> (helpers, officers, admin only):
          nickname, password hash (scrypt; the password itself is not stored),
          role, who invited you, account creation time, last seen time, and
          disable status if an account is turned off.
        </li>
        <li>
          <strong>Session cookie</strong> (<code>warzone_session</code>): a
          signed token that keeps you signed in (about 30 days).
        </li>
        <li>
          <strong>Locale cookie</strong> (<code>warzone_locale</code>): your
          interface language choice (EN / RU / AR).
        </li>
        <li>
          <strong>Map contribution metadata</strong>: who changed ownership,
          confirmations, shields or battle marks (stored as a nickname for
          coordination), and free-text notes officers may attach to map nodes.
        </li>
        <li>
          <strong>War room chat</strong> (officers and admin only): message
          text, author account id (when available), author nickname (stored on
          the message so history stays readable if an account is later
          disabled), optional pin to a map node, and the time the line was
          sent. Chat is stored in the same server database as the map so other
          officers can read recent history when they open the room. Guests and
          helpers cannot open the war room or receive chat events.
        </li>
        <li>
          <strong>War room capture plan</strong> (officers and admin only):
          shared trail data (ordered map-node ids forming capture paths), which
          kingdom the room routes from (planning kingdom setting, edited by
          admins), and free-text <strong>plan notes</strong> officers attach to
          nodes (shown as markers on the war-room map). This is coordination
          data about the game map, not a separate social profile. Live trail
          updates may be pushed over the same event stream as the map.
        </li>
        <li>
          <strong>Live “typing” signals</strong> (officers and admin only):
          while you compose a war-room message, the Service may briefly push
          your nickname to other open war-room tabs so they can show “is
          typing…”. These pulses are <strong>not stored</strong> in the
          database; they exist only in the live connection and disappear within
          seconds if you stop typing, send, or leave.
        </li>
        <li>
          <strong>Account audit log</strong>: actions such as invites or
          disabling accounts (actor, action, detail, time).
        </li>
        <li>
          <strong>Technical data for abuse protection</strong>: IP address used
          for rate limiting on sign-in / join / chat, and verification through
          Cloudflare Turnstile when that feature is enabled.
        </li>
        <li>
          <strong>Server / hosting logs</strong>: ordinary web-server and
          infrastructure logs that may include IP address, user agent and
          request metadata, retained only as needed for security and operations.
        </li>
      </ul>
      <p>
        Guests can view the map and statistics without an account. Viewing alone
        does not create a user profile. The war room and chat require an invited
        officer or admin session.
      </p>

      <h2>3. Purposes and legal bases (GDPR)</h2>
      <ul>
        <li>
          <strong>Providing the Service</strong> (accounts, map editing,
          sessions, language, war-room chat, shared capture trails and plan
          notes among officers): performance of a service you request /
          legitimate interest in running a small fan coordination tool.
        </li>
        <li>
          <strong>Security</strong> (rate limits, Turnstile, session integrity,
          disabling abusive accounts, chat abuse limits): legitimate interest in
          protecting the Service and its users.
        </li>
        <li>
          <strong>Legal obligations</strong>: where we must respond to a valid
          request from authorities.
        </li>
      </ul>
      <p>
        We do not sell personal data and we do not use it for advertising
        profiles. We do not use chat content for advertising or profiling.
      </p>

      <h2>4. Cookies</h2>
      <p>We use only cookies that are needed for the Service to work:</p>
      <ul>
        <li>
          <code>warzone_session</code> — authentication (httpOnly, SameSite=Lax;
          Secure in production).
        </li>
        <li>
          <code>warzone_locale</code> — language preference.
        </li>
      </ul>
      <p>
        These are strictly necessary or preference cookies. We do not use
        third-party advertising or analytics cookies on this site. If Cloudflare
        Turnstile is enabled on login/registration forms, Cloudflare may set its
        own cookies or similar technologies as described in Cloudflare’s
        documentation and privacy policy.
      </p>

      <h2>5. Recipients and processors</h2>
      <ul>
        <li>
          <strong>Hosting:</strong> DigitalOcean, LLC (server infrastructure).
        </li>
        <li>
          <strong>Bot protection (optional):</strong> Cloudflare, Inc.
          (Turnstile), when site keys are configured.
        </li>
        <li>
          <strong>Invite-only teammates:</strong> officers/admins may see
          nicknames, roles and related team fields needed to run the map.
          Officers and admins who can open the war room also see chat history,
          the shared capture plan, plan notes, and live typing indicators for
          that room.
        </li>
      </ul>
      <p>
        Data is stored in a database file on the application server. We do not
        share account or chat data with the game publisher.
      </p>

      <h2>6. International transfers</h2>
      <p>
        Hosting and security providers may process data in the United States or
        other countries. Where required, transfers rely on the provider’s
        appropriate safeguards (for example standard contractual clauses or
        equivalent mechanisms they offer).
      </p>

      <h2>7. Retention</h2>
      <ul>
        <li>
          <strong>Accounts:</strong> kept while the account is useful for the
          Service; disabled accounts may be retained so map history still makes
          sense, unless deletion is requested and feasible.
        </li>
        <li>
          <strong>Session cookie:</strong> up to about 30 days, or until you sign
          out.
        </li>
        <li>
          <strong>Locale cookie:</strong> until it expires or you clear cookies.
        </li>
        <li>
          <strong>Map change / audit logs:</strong> kept for operational history
          of events; may be purged when no longer needed.
        </li>
        <li>
          <strong>War room chat:</strong> kept while useful for ongoing event
          coordination (same server database as the map). Lines may be purged
          when no longer needed for operations, or earlier on a valid deletion
          request where feasible. The UI only loads a recent tail by default;
          older lines may still exist in the database until purged.
        </li>
        <li>
          <strong>War room plan (trails, planning kingdom, plan notes):</strong>{" "}
          kept while useful for the current event coordination; may be cleared
          by officers through the product UI (for example clearing the plan or
          deleting a note) or purged with other operational data when no longer
          needed. Trails and notes are shared among officers, not private
          messages to the publisher alone.
        </li>
        <li>
          <strong>Typing indicators:</strong> not retained; seconds only, in
          memory / live push.
        </li>
        <li>
          <strong>Rate-limit / short-lived security data:</strong> short windows
          (on the order of hours) in memory where applicable.
        </li>
        <li>
          <strong>Server logs:</strong> according to normal hosting practice,
          typically limited periods for security and debugging.
        </li>
      </ul>

      <h2>8. Your rights</h2>
      <p>
        If you are in the EEA/UK (or otherwise entitled under applicable law),
        you may have the right to access, rectify, erase, restrict or object to
        certain processing, and to data portability where applicable. To
        exercise these rights, email{" "}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> from a contact
        we can reasonably link to your account (for example the nickname used on
        the Service).
      </p>
      <p>
        You may also lodge a complaint with a supervisory authority. In France,
        that is the{" "}
        <a
          href="https://www.cnil.fr"
          target="_blank"
          rel="noopener noreferrer"
        >
          CNIL
        </a>
        .
      </p>

      <h2>9. Security</h2>
      <p>
        We use HTTPS, hashed passwords, signed session cookies and role checks
        on server actions and live streams (for example, chat and plan events
        are not sent to guests or helpers). No method of transmission or storage
        is perfectly secure; please choose a unique password and do not reuse
        credentials from the game or other sites. Treat war-room chat, trails
        and plan notes as shared with other officers — do not post secrets you
        would not say in a private officers’ channel.
      </p>

      <h2>10. Children</h2>
      <p>
        The Service is aimed at players of {GAME_NAME} who coordinate an
        alliance event. It is not directed at children. If you believe we hold
        data about a minor without appropriate basis, contact us to request
        deletion.
      </p>

      <h2>11. Changes</h2>
      <p>
        We may update this policy when the Service or the law changes. The “Last
        updated” date at the top will change accordingly. Continued use after an
        update means you should review the new text.
      </p>

      <h2>12. Related documents</h2>
      <ul>
        <li>
          <a href="/legal">Legal notice</a>
        </li>
        <li>
          <a href="/terms">Terms of use</a>
        </li>
      </ul>
    </LegalDoc>
  );
}
