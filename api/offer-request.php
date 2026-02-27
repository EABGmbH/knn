<?php
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
  http_response_code(405);
  echo json_encode(['ok' => false, 'message' => 'Methode nicht erlaubt']);
  exit;
}

function read_json_field($name) {
  if (!isset($_POST[$name])) return null;
  $decoded = json_decode($_POST[$name], true);
  return is_array($decoded) ? $decoded : null;
}

function clean_text($value) {
  $text = is_string($value) ? trim($value) : '';
  return preg_replace('/\s+/', ' ', $text);
}

$offer = read_json_field('offer');
$calculator = read_json_field('calculator');

if (!$offer || !$calculator) {
  http_response_code(400);
  echo json_encode(['ok' => false, 'message' => 'Ungültige Nutzdaten']);
  exit;
}

$customerEmail = clean_text($offer['email'] ?? '');
$firstName = clean_text($offer['vorname'] ?? '');
$lastName = clean_text($offer['nachname'] ?? '');

if ($customerEmail === '' || !filter_var($customerEmail, FILTER_VALIDATE_EMAIL) || $firstName === '' || $lastName === '') {
  http_response_code(400);
  echo json_encode(['ok' => false, 'message' => 'Pflichtdaten fehlen oder E-Mail ist ungültig']);
  exit;
}

$fromEmail = 'anfrage@energy-advice-bavaria.de';
$companyEmail = 'anfrage@energy-advice-bavaria.de';

$calculatorSummary = [];
$formData = $calculator['formData'] ?? [];
$validation = $calculator['validationResult'] ?? [];
$rates = $calculator['zinssaetze'] ?? [];

$calculatorSummary[] = 'Projektart: ' . clean_text($formData['projektartLabel'] ?? '-');
$calculatorSummary[] = 'PLZ: ' . clean_text($formData['plz'] ?? '-');
$calculatorSummary[] = 'Wohneinheiten: ' . clean_text((string)($formData['wohneinheiten'] ?? '-'));
$calculatorSummary[] = 'EH55-Status: ' . clean_text($formData['eh55Label'] ?? '-');
$calculatorSummary[] = 'Wärmeerzeuger: ' . clean_text($formData['heaterLabel'] ?? '-');
$calculatorSummary[] = 'Status: ' . clean_text($validation['status'] ?? '-');
$calculatorSummary[] = 'Max. Kreditsumme: ' . clean_text((string)($validation['maxKreditsumme'] ?? '-'));
$calculatorSummary[] = 'KfW-Zins: ' . clean_text((string)($rates['kfw296'] ?? '-')) . ' %';
$calculatorSummary[] = 'Markt-Zins: ' . clean_text((string)($rates['market10yGt90'] ?? '-')) . ' %';
$calculatorSummary[] = 'Stand: ' . clean_text($calculator['stand'] ?? '-');

$offerLines = [];
$offerLines[] = 'Vorname: ' . $firstName;
$offerLines[] = 'Nachname: ' . $lastName;
$offerLines[] = 'E-Mail: ' . $customerEmail;
$offerLines[] = 'Handy: ' . clean_text($offer['handy'] ?? '-');
$offerLines[] = 'Firma: ' . clean_text($offer['firma'] ?? '-');
$offerLines[] = 'Straße: ' . clean_text($offer['strasse'] ?? '-');
$offerLines[] = 'Hausnummer: ' . clean_text($offer['hausnummer'] ?? '-');
$offerLines[] = 'PLZ: ' . clean_text($offer['plz'] ?? '-');
$offerLines[] = 'Ort: ' . clean_text($offer['ort'] ?? '-');
$offerLines[] = 'Notizen: ' . clean_text($offer['notizen'] ?? '-');

$plainBodyCustomer = "Guten Tag {$firstName} {$lastName},\n\n" .
  "vielen Dank für Ihre unverbindliche Anfrage bei Energy Advice Bavaria.\n" .
  "Im Anhang finden Sie die identische Ergebnis-PDF aus dem Rechner.\n\n" .
  "Viele Grüße\nEnergy Advice Bavaria";

$plainBodyCompany = "Neue Angebotsanfrage eingegangen.\n\n" .
  "Kundendaten:\n" . implode("\n", $offerLines) . "\n\n" .
  "Rechnerdaten:\n" . implode("\n", $calculatorSummary);

$pdfAttachment = $_FILES['rechnerPdf'] ?? null;
if (!$pdfAttachment || ($pdfAttachment['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
  http_response_code(400);
  echo json_encode(['ok' => false, 'message' => 'Ergebnis-PDF fehlt im Upload']);
  exit;
}

$pdfTmp = $pdfAttachment['tmp_name'];
$pdfName = basename($pdfAttachment['name'] ?? 'kfw296-ergebnis.pdf');
$pdfContent = file_get_contents($pdfTmp);
if ($pdfContent === false) {
  http_response_code(500);
  echo json_encode(['ok' => false, 'message' => 'PDF konnte nicht gelesen werden']);
  exit;
}

function send_mail_with_attachment($to, $subject, $body, $from, $attachmentContent, $attachmentName) {
  $boundary = '==Multipart_Boundary_x' . md5((string)microtime(true)) . 'x';

  $headers = [];
  $headers[] = 'From: Energy Advice Bavaria <' . $from . '>';
  $headers[] = 'Reply-To: ' . $from;
  $headers[] = 'MIME-Version: 1.0';
  $headers[] = 'Content-Type: multipart/mixed; boundary="' . $boundary . '"';

  $message = '';
  $message .= '--' . $boundary . "\r\n";
  $message .= "Content-Type: text/plain; charset=UTF-8\r\n";
  $message .= "Content-Transfer-Encoding: 8bit\r\n\r\n";
  $message .= $body . "\r\n\r\n";

  $message .= '--' . $boundary . "\r\n";
  $message .= 'Content-Type: application/pdf; name="' . $attachmentName . '"' . "\r\n";
  $message .= "Content-Transfer-Encoding: base64\r\n";
  $message .= 'Content-Disposition: attachment; filename="' . $attachmentName . '"' . "\r\n\r\n";
  $message .= chunk_split(base64_encode($attachmentContent)) . "\r\n";
  $message .= '--' . $boundary . '--';

  return mail($to, $subject, $message, implode("\r\n", $headers));
}

$subjectCustomer = 'Ihre Anfrage bei Energy Advice Bavaria';
$subjectCompany = 'Neue Anfrage aus KfW-296 Rechner';

$okCustomer = send_mail_with_attachment($customerEmail, $subjectCustomer, $plainBodyCustomer, $fromEmail, $pdfContent, $pdfName);
$okCompany = send_mail_with_attachment($companyEmail, $subjectCompany, $plainBodyCompany, $fromEmail, $pdfContent, $pdfName);

if (!$okCustomer || !$okCompany) {
  http_response_code(500);
  echo json_encode(['ok' => false, 'message' => 'E-Mail Versand fehlgeschlagen']);
  exit;
}

echo json_encode(['ok' => true]);
