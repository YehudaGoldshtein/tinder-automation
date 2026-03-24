import { launchBrowser, closeBrowser } from './browser';
import { isLoggedIn } from './actions/auth';
import { openMatchById } from './actions/matches';
import { dismissPopups } from './actions/popups';
import { sendMessage } from './actions/messages';
import { randomDelay } from './utils/delay';
import logger from './utils/logger';

interface PlannedReply {
  name: string;
  matchId: string;
  message: string;
  category: string;
}

const replies: PlannedReply[] = [
  // === ACTIVE (they replied last — respond naturally) ===
  { name: 'Azul', matchId: '68c9808e27eb2c32a46731bd691c8e6aaa3e797415e52f56',
    category: 'active',
    message: 'Que buena onda! Qué curso estás haciendo? Yo hoy fui a caminar por el centro' },
  { name: 'Belen Billalba', matchId: '68c9808e27eb2c32a46731bd68efa2e772a9d305558e29b4',
    category: 'active',
    message: 'Jajaja por qué lo dudas? 😄 Qué haces vos de divertido por aquí?' },
  { name: 'Karol', matchId: '67d4b6087fa75504e88bb61d68c9808e27eb2c32a46731bd',
    category: 'active',
    message: 'Mariano? No conozco ese barrio todavía. Me llevas a conocerlo? 😄' },
  { name: 'Luz Ortellado', matchId: '68c9808e27eb2c32a46731bd695ae689beab2878f3bfe450',
    category: 'active',
    message: 'Cómo va tu semana? Yo sigo descubriendo la ciudad, me encanta' },
  { name: 'Magui', matchId: '68c9808e27eb2c32a46731bd698f6e69baf785f2fedfb7e5',
    category: 'active',
    message: 'Qué onda! Cómo va tu semana? Algún plan interesante?' },
  { name: 'Matilde', matchId: '53cc3593d3e23e0100e37a1168c9808e27eb2c32a46731bd',
    category: 'active',
    message: 'Estoy bien! Recién llegué a Paraguay y estoy conociendo todo. Vos de dónde sos?' },
  { name: 'Natividad', matchId: '673a42631bbbae01007255cd68c9808e27eb2c32a46731bd',
    category: 'active',
    message: 'Tu bio! Jaja me pareció profundo. Qué haces vos por acá?' },
  { name: 'Sabrina Sosa', matchId: '5c4b1d68bb81af1100c43f9368c9808e27eb2c32a46731bd',
    category: 'active',
    message: 'Hey! Cómo va tu día? Soy nuevo en Asunción, buscando gente copada para salir' },
  { name: 'Sam', matchId: '68c9808e27eb2c32a46731bd69632a11a9d5a9323433dad9',
    category: 'active',
    message: 'Todo bien! Conociendo Paraguay, me encanta. Vos qué haces de divertido por acá?' },
  { name: 'Solcita', matchId: '68c9808e27eb2c32a46731bd690974f71d9f2ae1c9a5c1f9',
    category: 'active',
    message: 'Sajonia! Escuché que es lindo por ahí. Cuál es tu insta/whatsapp?' },
  { name: 'Yersy', matchId: '68c74147a19b5347c53a7b0c68c9808e27eb2c32a46731bd',
    category: 'active',
    message: 'Jaja buena detective! Sí, soy de Israel. Con quiénes trabajas?' },

  // === RECOVERABLE STALE (re-engage with context) ===
  { name: 'Angelli', matchId: '68c9808e27eb2c32a46731bd68f02b77ec6acd52c1404259',
    category: 'stale_recover',
    message: 'Hey! Se me pasó responderte. Cómo va todo? Algún plan para esta semana?' },
  { name: 'Araceli', matchId: '68212c19b47d193b9f5c1caf68c9808e27eb2c32a46731bd',
    category: 'stale_recover',
    message: 'Hey Araceli! Seguís tomando café a esta hora? ☕ Yo recién estoy armando mi rutina acá' },
  { name: 'Deyanira Ortiz', matchId: '68c9808e27eb2c32a46731bd69ba1897baf78551b4f25948',
    category: 'stale_recover',
    message: 'Bueno, la invitación sigue en pie 😄 Cuándo estás libre?' },
  { name: 'Gaby', matchId: '68c9808e27eb2c32a46731bd69a413e75384c1972d0c0118',
    category: 'stale_recover',
    message: 'Ey! Ya estás por Asunción? Si sí, vamos por un café o una cerveza 🍻' },
  { name: 'Lara', matchId: '68c9808e27eb2c32a46731bd690634ffecf169f743a37640',
    category: 'stale_recover',
    message: 'Cómo van las clases de inglés? Si quieres practicar un día, me sumo 😄' },
  { name: 'Monse', matchId: '67b709a2afc7ce3d8b9737af68c9808e27eb2c32a46731bd',
    category: 'stale_recover',
    message: 'Exacto! Entonces... café esta semana? ☕ Todavía estoy por acá' },
  { name: 'Rosa', matchId: '68abc17e72a9d3105d43e20968c9808e27eb2c32a46731bd',
    category: 'stale_recover',
    message: 'Ya visité más lugares! Ayer fui a conocer el centro. Vos conocés algún lugar escondido que valga la pena?' },
  { name: 'Marie', matchId: '6755c7f0a7bbc0010064165568c9808e27eb2c32a46731bd',
    category: 'stale_recover',
    message: 'Y tú viajaste a algún lado? Me encanta encontrar gente que le gusta viajar también' },
  { name: 'Dai', matchId: '68c9808e27eb2c32a46731bd68d8bc2eaa9ff460b0d60be3',
    category: 'stale_recover',
    message: 'Hey Dai! Still in Paraguay? Would love to meet up if you\'re around 😊' },
  { name: 'Bianca', matchId: '68557f2b27eb2c105e2e7da568c9808e27eb2c32a46731bd',
    category: 'stale_recover',
    message: 'Hey Bianca! Se me pasó responderte. Qué onda, cómo va todo?' },

  // === ASKED WA — push for the number gently ===
  { name: 'Cami Vega', matchId: '6826b2836a023023f112d58e68c9808e27eb2c32a46731bd',
    category: 'push_wa',
    message: 'Te invito cuando quieras! Mándame tu WhatsApp y coordinamos 😊' },
  { name: 'Paty', matchId: '68c9808e27eb2c32a46731bd695f0d589f2d719da791c171',
    category: 'push_wa',
    message: 'Dale, yo te mando mensaje. Mi número es +972504265054 😊' },
  { name: 'Joa', matchId: '634f3d99466a8c0100d88a8468c9808e27eb2c32a46731bd',
    category: 'push_wa',
    message: 'Jaja verdad, por eso solo uso WhatsApp. Te paso mi número? Así hablamos más fácil' },
  { name: 'Crissh Augus', matchId: '68c9808e27eb2c32a46731bd6943504daa3e79474cf70a62',
    category: 'push_wa',
    message: 'Dale, mándame tu número y te escribo! O este es el mío: +972504265054' },
];

async function main() {
  const { page } = await launchBrowser(false);
  const loggedIn = await isLoggedIn(page);
  if (!loggedIn) { logger.error('Not logged in!'); await closeBrowser(); return; }

  let sent = 0;
  let failed = 0;

  for (const reply of replies) {
    logger.info(`\n[${reply.category}] ${reply.name}: "${reply.message.slice(0, 50)}..."`);

    try {
      await openMatchById(page, reply.matchId);
      await page.waitForTimeout(2000);
      await dismissPopups(page);

      const success = await sendMessage(page, reply.message);
      if (success) {
        sent++;
        logger.info(`  ✓ Sent!`);
      } else {
        failed++;
        logger.error(`  ✗ Failed to send`);
      }
    } catch (e) {
      failed++;
      logger.error(`  ✗ Error: ${e}`);
    }

    // Random delay between messages (5-15s)
    await randomDelay(5000, 15000);
  }

  logger.info(`\n=== DONE ===`);
  logger.info(`Sent: ${sent}`);
  logger.info(`Failed: ${failed}`);

  await closeBrowser();
}

main().catch(console.error);
