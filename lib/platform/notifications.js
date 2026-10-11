/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
/**
 * Service notifications (APP-058). Every message originates from a server event, is deduplicated
 * by a key, and has its own delivery record (queued · sent · failed · not_configured) that is
 * independent of the business record it refers to. A failed e-mail never un-saves a request or an
 * order. Templates are versioned per locale (en / ru / fr; other locales fall back to English and
 * say so). Messages carry the minimum: what happened and a link to the secure cabinet.
 *
 * Transport: the SMTP settings already authorised for the intake (lib/intake/config.js). When no
 * SMTP is configured the record is kept as not_configured and nothing is pretended.
 */
import { newId, sha256 } from "./ids";
import { smtpSettings } from "../intake/config";
import { createSmtpNotifier } from "../intake/notify";

export const TEMPLATE_VERSION = "2026-10-09.1";

const T = {
  en: {
    verify_email: { subject: "Confirm your e-mail address", body: "Confirm your MAXIMUS account by opening this link within {ttlMinutes} minutes:\n{link}\n\nIf you did not create an account, ignore this message." },
    register_existing: { subject: "Your MAXIMUS account", body: "Someone tried to register with this address. An account already exists; use sign-in or password recovery. No action is needed otherwise." },
    password_reset: { subject: "Reset your password", body: "Open this link within {ttlMinutes} minutes to set a new password:\n{link}\n\nIf you did not ask for this, ignore this message; your password stays unchanged." },
    security_password_changed: { subject: "Your password was changed", body: "The password of your MAXIMUS account was changed and other sessions were signed out. If this was not you, reset your password now." },
    email_change_verify: { subject: "Confirm your new e-mail address", body: "Open this link while signed in to confirm the new address:\n{link}" },
    email_change_notice: { subject: "E-mail change requested", body: "A change of the e-mail address of your MAXIMUS account was requested. If this was not you, sign in and review your account security." },
    email_changed_old_address: { subject: "E-mail address changed", body: "The e-mail address of your MAXIMUS account has been changed. If this was not you, contact gps@maximus.tennis." },
    deletion_requested: { subject: "Account deletion requested", body: "Deletion of your MAXIMUS account is scheduled for {scheduledFor}. Records that must be kept by law are retained with your identifier pseudonymised." },
    coach_invitation: { subject: "Invitation to view a racquet configuration", body: "You have been invited to access the configuration of {profileName} with the scope: {scope}. Open the cabinet to accept or decline:\n{link}" },
    request_saved: { subject: "Request {number} saved", body: "Your request {number} has been saved. Its status is visible in your cabinet:\n{link}" },
    request_information_requested: { subject: "Request {number}: information needed", body: "MAXIMUS asks for a clarification on request {number}. Answer in your cabinet:\n{link}" },
    quote_issued: { subject: "Quotation {number} issued", body: "A quotation is ready in your cabinet. Nothing is due until you accept it:\n{link}" },
    specification_decided: { subject: "Specification review: {decision}", body: "The manufacturing review of configuration {name} is: {decision}. Details in your cabinet:\n{link}" },
    payment_confirmed: { subject: "Payment confirmed for order {number}", body: "The payment for order {number} has been confirmed and the order proceeds. Details:\n{link}" },
    order_status: { subject: "Order {number}: {status}", body: "Order {number} is now: {status}.\n{link}" },
    action_required: { subject: "Action needed on {number}", body: "{text}\n{link}" },
  },
  ru: {
    verify_email: { subject: "Подтвердите адрес электронной почты", body: "Подтвердите аккаунт MAXIMUS, открыв ссылку в течение {ttlMinutes} минут:\n{link}\n\nЕсли вы не создавали аккаунт, проигнорируйте это письмо." },
    register_existing: { subject: "Ваш аккаунт MAXIMUS", body: "Кто-то попытался зарегистрироваться с этим адресом. Аккаунт уже существует: используйте вход или восстановление пароля. Иначе ничего делать не нужно." },
    password_reset: { subject: "Сброс пароля", body: "Откройте ссылку в течение {ttlMinutes} минут, чтобы задать новый пароль:\n{link}\n\nЕсли вы этого не запрашивали, проигнорируйте письмо; пароль не изменится." },
    security_password_changed: { subject: "Пароль изменён", body: "Пароль вашего аккаунта MAXIMUS изменён, остальные сессии завершены. Если это были не вы, немедленно сбросьте пароль." },
    email_change_verify: { subject: "Подтвердите новый адрес", body: "Откройте ссылку, находясь в системе, чтобы подтвердить новый адрес:\n{link}" },
    email_change_notice: { subject: "Запрошена смена адреса", body: "Запрошена смена адреса электронной почты вашего аккаунта MAXIMUS. Если это были не вы, войдите и проверьте безопасность аккаунта." },
    email_changed_old_address: { subject: "Адрес электронной почты изменён", body: "Адрес электронной почты вашего аккаунта MAXIMUS изменён. Если это были не вы, напишите на gps@maximus.tennis." },
    deletion_requested: { subject: "Запрошено удаление аккаунта", body: "Удаление вашего аккаунта MAXIMUS назначено на {scheduledFor}. Записи, обязательные к хранению по закону, сохраняются с псевдонимизированным идентификатором." },
    coach_invitation: { subject: "Приглашение к конфигурации ракетки", body: "Вам предоставлено приглашение к конфигурации {profileName} с объёмом доступа: {scope}. Откройте кабинет, чтобы принять или отклонить:\n{link}" },
    request_saved: { subject: "Заявка {number} сохранена", body: "Ваша заявка {number} сохранена. Статус виден в кабинете:\n{link}" },
    request_information_requested: { subject: "Заявка {number}: требуется уточнение", body: "MAXIMUS просит уточнение по заявке {number}. Ответьте в кабинете:\n{link}" },
    quote_issued: { subject: "Выдана котировка {number}", body: "Котировка готова в вашем кабинете. До её принятия ничего не подлежит оплате:\n{link}" },
    specification_decided: { subject: "Проверка спецификации: {decision}", body: "Результат производственной проверки конфигурации {name}: {decision}. Подробности в кабинете:\n{link}" },
    payment_confirmed: { subject: "Оплата заказа {number} подтверждена", body: "Оплата заказа {number} подтверждена, заказ продолжается. Подробности:\n{link}" },
    order_status: { subject: "Заказ {number}: {status}", body: "Заказ {number} теперь в состоянии: {status}.\n{link}" },
    action_required: { subject: "Требуется действие по {number}", body: "{text}\n{link}" },
  },
  fr: {
    verify_email: { subject: "Confirmez votre adresse e-mail", body: "Confirmez votre compte MAXIMUS en ouvrant ce lien dans les {ttlMinutes} minutes :\n{link}\n\nSi vous n'avez pas créé de compte, ignorez ce message." },
    register_existing: { subject: "Votre compte MAXIMUS", body: "Quelqu'un a tenté de s'inscrire avec cette adresse. Un compte existe déjà : utilisez la connexion ou la récupération du mot de passe. Sinon, aucune action n'est nécessaire." },
    password_reset: { subject: "Réinitialisez votre mot de passe", body: "Ouvrez ce lien dans les {ttlMinutes} minutes pour définir un nouveau mot de passe :\n{link}\n\nSi vous n'avez rien demandé, ignorez ce message ; votre mot de passe reste inchangé." },
    security_password_changed: { subject: "Votre mot de passe a été modifié", body: "Le mot de passe de votre compte MAXIMUS a été modifié et les autres sessions ont été fermées. Si ce n'était pas vous, réinitialisez votre mot de passe maintenant." },
    email_change_verify: { subject: "Confirmez votre nouvelle adresse e-mail", body: "Ouvrez ce lien en étant connecté pour confirmer la nouvelle adresse :\n{link}" },
    email_change_notice: { subject: "Changement d'adresse e-mail demandé", body: "Un changement de l'adresse e-mail de votre compte MAXIMUS a été demandé. Si ce n'était pas vous, connectez-vous et vérifiez la sécurité de votre compte." },
    email_changed_old_address: { subject: "Adresse e-mail modifiée", body: "L'adresse e-mail de votre compte MAXIMUS a été modifiée. Si ce n'était pas vous, écrivez à gps@maximus.tennis." },
    deletion_requested: { subject: "Suppression du compte demandée", body: "La suppression de votre compte MAXIMUS est programmée pour le {scheduledFor}. Les enregistrements à conserver par la loi sont gardés avec votre identifiant pseudonymisé." },
    coach_invitation: { subject: "Invitation à consulter une configuration de raquette", body: "Vous êtes invité(e) à accéder à la configuration de {profileName} avec la portée : {scope}. Ouvrez l'espace client pour accepter ou refuser :\n{link}" },
    request_saved: { subject: "Demande {number} enregistrée", body: "Votre demande {number} a été enregistrée. Son statut est visible dans votre espace client :\n{link}" },
    request_information_requested: { subject: "Demande {number} : information requise", body: "MAXIMUS demande une précision sur la demande {number}. Répondez dans votre espace client :\n{link}" },
    quote_issued: { subject: "Devis {number} émis", body: "Un devis est disponible dans votre espace client. Rien n'est dû avant son acceptation :\n{link}" },
    specification_decided: { subject: "Examen de la spécification : {decision}", body: "L'examen de fabrication de la configuration {name} est : {decision}. Détails dans votre espace client :\n{link}" },
    payment_confirmed: { subject: "Paiement confirmé pour la commande {number}", body: "Le paiement de la commande {number} a été confirmé et la commande se poursuit. Détails :\n{link}" },
    order_status: { subject: "Commande {number} : {status}", body: "La commande {number} est maintenant : {status}.\n{link}" },
    action_required: { subject: "Action requise sur {number}", body: "{text}\n{link}" },
  },
};

export function renderTemplate(templateKey, locale, params = {}) {
  const pack = T[locale] || T.en;
  const t = pack[templateKey] || T.en[templateKey];
  if (!t) throw new Error(`unknown template ${templateKey}`);
  const fill = (s) => s.replace(/\{(\w+)\}/g, (_, k) => (params[k] === undefined || params[k] === null ? "" : Array.isArray(params[k]) ? params[k].join(", ") : String(params[k])));
  const fallback = !T[locale] ? "\n\n(This message is sent in English; a translation into your language is not yet available.)" : "";
  return { subject: fill(t.subject), text: `${fill(t.body)}${fallback}`, templateVersion: TEMPLATE_VERSION, locale: T[locale] ? locale : "en" };
}

/**
 * The mailer. `transport` is anything with send({ to, subject, text, headers }) → { ok, messageId, errorCode }.
 * Without a transport every delivery is recorded as not_configured.
 */
export function createMailer({ store, transport = null, now = () => Date.now(), env = {} }) {
  const iso = (ms) => new Date(ms).toISOString();
  async function send({ to, templateKey, locale, params, dedupeKey }) {
    const at = now();
    const key = dedupeKey ? sha256(dedupeKey) : null;
    if (key) {
      const seen = await store.getUnique("notification_dedupe", key);
      if (seen) return { ok: true, status: "deduplicated", deliveryId: seen };
    }
    const id = newId("ntf");
    const rendered = renderTemplate(templateKey, locale, params);
    const record = { id, to: sha256(String(to).toLowerCase()), toDisplay: process.env.NODE_ENV === "production" ? undefined : to, templateKey, templateVersion: rendered.templateVersion, locale: rendered.locale, status: "queued", attempts: 0, createdAt: iso(at), sentAt: null, lastError: null, messageId: null };
    await store.commit({ writes: [{ type: "notification", id, doc: record, expectedVersion: -1 }], uniques: key ? [{ name: "notification_dedupe", value: key, owner: id }] : [], indexes: [{ name: "notifications:all", member: id, score: at }, { name: "admin:notifications:undelivered", member: id, score: at }] });
    let result;
    if (!transport) result = { ok: false, errorCode: "not_configured" };
    else {
      try {
        result = await transport.send({ to, subject: rendered.subject, text: rendered.text, headers: { "X-Maximus-Notification": id } });
      } catch (e) {
        result = { ok: false, errorCode: (e && e.code) || "transport_error" };
      }
    }
    const status = result.ok ? "sent" : result.errorCode === "not_configured" ? "not_configured" : "failed";
    const rec = await store.get("notification", id);
    await store.commit({ writes: [{ type: "notification", id, doc: { ...rec.doc, status, attempts: 1, sentAt: result.ok ? iso(now()) : null, messageId: result.ok ? result.messageId || "" : null, lastError: result.ok ? null : result.errorCode }, expectedVersion: rec.version }], unindexes: result.ok ? [{ name: "admin:notifications:undelivered", member: id }] : [] });
    // In non-production environments the rendered message is kept for tests and local review (never in production).
    if (process.env.NODE_ENV !== "production") sent.push({ id, to, templateKey, subject: rendered.subject, text: rendered.text, status });
    return { ok: result.ok, status, deliveryId: id };
  }
  const sent = [];
  async function retry(id) {
    const rec = await store.get("notification", id);
    if (!rec || rec.doc.status === "sent") return rec ? rec.doc : null;
    return rec.doc; // body is not stored; retry re-triggers from the originating event in the service that raised it
  }
  async function undelivered({ limit = 50, offset = 0 } = {}) {
    const ids = await store.listIndex("admin:notifications:undelivered", { limit, offset });
    return (await store.getMany("notification", ids)).map((r) => r.doc);
  }
  return { send, retry, undelivered, outbox: sent, configured: !!transport };
}

/** The SMTP transport of the intake, reused when the owner has configured it; otherwise null. */
export function resolveMailTransport(env = process.env) {
  const smtp = smtpSettings(env);
  if (!smtp) return null;
  const n = createSmtpNotifier(smtp);
  return {
    async send({ to, subject, text, headers }) {
      // createSmtpNotifier builds its message from a lead record; a direct transport is used here.
      const nodemailer = (await import("nodemailer")).default;
      const t = nodemailer.createTransport({ host: smtp.host, port: smtp.port, secure: smtp.secure, requireTLS: smtp.requireTLS, ignoreTLS: smtp.ignoreTLS, auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined, connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000, tls: { minVersion: "TLSv1.2" } });
      try {
        const info = await t.sendMail({ from: smtp.from, to, subject, text, headers });
        if (info && info.rejected && info.rejected.length) return { ok: false, errorCode: "smtp_rejected" };
        return { ok: true, messageId: info && info.messageId ? String(info.messageId).slice(0, 200) : "" };
      } catch (e) {
        return { ok: false, errorCode: (e && (e.code || e.responseCode)) ? `smtp_${e.code || e.responseCode}` : "smtp_error" };
      }
    },
    channel: n.channel,
  };
}
