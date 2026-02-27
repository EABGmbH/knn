(function () {
  function formatEuroWithCode(value) {
    return `${new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 }).format(value)} EUR`;
  }

  function formatTwoDecimals(value) {
    return Number(value).toFixed(2).replace(".", ",");
  }

  function calculateMonthlyInterestCost(principal, annualRatePercent) {
    const monthlyRate = annualRatePercent / 100 / 12;
    return principal * monthlyRate;
  }

  function addPdfKvLine(doc, leftX, rightX, y, label, value, color) {
    const lineColor = color || [17, 24, 39];
    doc.setTextColor(lineColor[0], lineColor[1], lineColor[2]);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.2);
    doc.text(label, leftX, y);
    doc.setFont("helvetica", "bold");
    doc.text(value, rightX, y, { align: "right" });
  }

  function drawPdfHeader(doc, logo, title) {
    doc.setFillColor(76, 104, 91);
    doc.rect(0, 0, 210, 22, "F");

    const logoBoxX = 178;
    const logoBoxY = 4.5;
    const logoBoxW = 22;
    const logoBoxH = 13;

    if (logo) {
      const logoProps = doc.getImageProperties(logo);
      const logoRatio = logoProps.width / logoProps.height;
      const logoBoxRatio = logoBoxW / logoBoxH;

      let drawLogoW = logoBoxW;
      let drawLogoH = logoBoxH;

      if (logoRatio > logoBoxRatio) {
        drawLogoH = logoBoxW / logoRatio;
      } else {
        drawLogoW = logoBoxH * logoRatio;
      }

      const drawLogoX = logoBoxX + (logoBoxW - drawLogoW) / 2;
      const drawLogoY = logoBoxY + (logoBoxH - drawLogoH) / 2;
      doc.addImage(logo, "PNG", drawLogoX, drawLogoY, drawLogoW, drawLogoH);
    }

    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.text(title, 10, 13.5);
  }

  async function loadImageAsDataUrl(path) {
    const response = await fetch(path);
    if (!response.ok) {
      throw new Error(`Bild konnte nicht geladen werden: ${path}`);
    }

    const blob = await response.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = () => reject(new Error(`Bild konnte nicht verarbeitet werden: ${path}`));
      reader.readAsDataURL(blob);
    });
  }

  async function loadOptionalImageAsDataUrl(path) {
    try {
      return await loadImageAsDataUrl(path);
    } catch (error) {
      console.warn(`Optionales Bild fehlt oder konnte nicht geladen werden: ${path}`, error);
      return null;
    }
  }

  async function createPdfFileFromPayload(payload, options) {
    if (!window.jspdf || !window.jspdf.jsPDF) {
      throw new Error("PDF-Bibliothek konnte nicht geladen werden.");
    }

    const config = options || {};
    const fileName = config.fileName || "kfw296-ergebnis.pdf";
    const save = Boolean(config.save);

    const maxKreditsumme = Number(payload?.maxKreditsumme || 0);
    const kfwRate = Number(payload?.kfwRate || 0);
    const marketRate = Number(payload?.marketRate || 0);

    const monthlyKfw = calculateMonthlyInterestCost(maxKreditsumme, kfwRate);
    const monthlyMarket = calculateMonthlyInterestCost(maxKreditsumme, marketRate);
    const monthlySaving = Math.max(0, monthlyMarket - monthlyKfw);
    const yearlySaving = monthlySaving * 12;

    const [titlePage, logo, qr, kfwAblauf] = await Promise.all([
      loadOptionalImageAsDataUrl("./titelblatt.png"),
      loadOptionalImageAsDataUrl("./logo.png"),
      loadOptionalImageAsDataUrl("./homepagestatistik.png"),
      loadOptionalImageAsDataUrl("./kfwablauf.png"),
    ]);

    const jsPDF = window.jspdf.jsPDF;
    const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });

    if (titlePage) {
      doc.addImage(titlePage, "PNG", 0, 0, 210, 297);
    } else {
      doc.setFillColor(245, 247, 250);
      doc.rect(0, 0, 210, 297, "F");
      doc.setTextColor(17, 24, 39);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(20);
      doc.text("KfW-296 Ergebnisbericht", 105, 150, { align: "center" });
    }

    doc.addPage();
    drawPdfHeader(doc, logo, "KfW - 296 KNN im Niedrigpreissegment - Ergebnis");

    doc.setTextColor(17, 24, 39);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.2);
    doc.text("Projektdaten:", 20, 34);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.8);
    doc.text(`Projektart: ${payload?.projektartLabel || "-"}`, 20, 42);
    doc.text(`Anzahl Wohneinheiten: ${payload?.count || 1}`, 20, 48);
    doc.text(`Objektstandort (PLZ): ${payload?.plz || "-"}`, 20, 54);
    doc.text(`EH55-Status: ${payload?.eh55Label || "-"}`, 20, 60);
    doc.text(`Wärmeerzeuger: ${payload?.heaterLabel || "-"}`, 20, 66);
    doc.text(`Kredithöhe: ${formatEuroWithCode(maxKreditsumme)}`, 20, 72);

    doc.setDrawColor(190, 198, 203);
    doc.setFillColor(247, 248, 250);
    doc.rect(15, 82, 180, 103, "FD");

    doc.setTextColor(17, 24, 39);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Finanzierungsübersicht", 20, 92);

    addPdfKvLine(doc, 25, 186, 102, "Kreditbetrag:", formatEuroWithCode(maxKreditsumme));
    addPdfKvLine(doc, 25, 186, 109, "Max. möglicher KfW-Kredit:", formatEuroWithCode(maxKreditsumme));

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.2);
    doc.text("Zinssätze (10 Jahre Zinsbindung):", 25, 120);
    doc.setTextColor(185, 28, 28);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.text("Hinweis: Längere Laufzeiten (11-35 Jahre) haben höhere KfW-Zinssätze.", 25, 126);

    addPdfKvLine(doc, 25, 186, 133, "KfW-Förderkredit EH40:", `${formatTwoDecimals(kfwRate)} % p.a.`);
    addPdfKvLine(doc, 25, 186, 140, "Marktüblicher Zins:", `${formatTwoDecimals(marketRate)} % p.a.`);

    doc.setTextColor(17, 24, 39);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.2);
    doc.text("Monatliche Zinsbelastung (ohne Tilgung):", 25, 151);

    addPdfKvLine(doc, 25, 186, 158, "Mit KfW-Förderung:", formatEuroWithCode(monthlyKfw));
    addPdfKvLine(doc, 25, 186, 165, "Bei Marktkonditionen:", formatEuroWithCode(monthlyMarket));

    doc.setFillColor(76, 104, 91);
    doc.rect(20, 170, 170, 10, "F");
    addPdfKvLine(doc, 25, 186, 176.8, "Monatlicher Zinsvorteil:", formatEuroWithCode(monthlySaving), [255, 255, 255]);

    doc.setFillColor(76, 104, 91);
    doc.rect(15, 191, 180, 21, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.text("Ihr Zinsvorteil gegenüber Marktkredit (1 Jahr):", 105, 200, { align: "center" });
    doc.setFontSize(15);
    doc.text(formatEuroWithCode(yearlySaving), 105, 207.8, { align: "center" });

    doc.setTextColor(17, 24, 39);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.4);
    doc.text("Über diesen Vergleich:", 15, 228);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.3);
    doc.text("Dieser Bericht zeigt den Zinsvorteil des KfW-Programms 296 im Vergleich zu marktüblichen Konditionen.", 15, 233, { maxWidth: 180 });
    doc.setFont("helvetica", "bold");
    doc.text("Hinweis zur Tilgung:", 15, 242.5);
    doc.setFont("helvetica", "normal");
    doc.text("Der Vergleich zeigt reine Zinskosten auf Basis der Darlehenssumme (ohne Tilgung).", 15, 247, { maxWidth: 180 });

    if (qr) {
      doc.addImage(qr, "PNG", 95, 275, 20, 20);
    }

    doc.addPage();
    drawPdfHeader(doc, logo, "KfW - 296 KNN im Niedrigpreissegment - Ablauf");

    const flowBoxX = 10;
    const flowBoxY = 28;
    const flowBoxW = 190;
    const flowBoxH = 240;

    if (kfwAblauf) {
      const flowProps = doc.getImageProperties(kfwAblauf);
      const flowRatio = flowProps.width / flowProps.height;
      const flowBoxRatio = flowBoxW / flowBoxH;

      let flowDrawW = flowBoxW;
      let flowDrawH = flowBoxH;

      if (flowRatio > flowBoxRatio) {
        flowDrawH = flowBoxW / flowRatio;
      } else {
        flowDrawW = flowBoxH * flowRatio;
      }

      const flowDrawX = flowBoxX + (flowBoxW - flowDrawW) / 2;
      const flowDrawY = flowBoxY + (flowBoxH - flowDrawH) / 2;
      doc.addImage(kfwAblauf, "PNG", flowDrawX, flowDrawY, flowDrawW, flowDrawH);
    } else {
      doc.setTextColor(17, 24, 39);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      doc.text("Ablaufgrafik konnte nicht geladen werden.", 105, 150, { align: "center" });
    }

    doc.link(51.5, 105.79, 54.8, 6.35, { url: "https://www.energy-advice-bavaria.de" });

    if (qr) {
      doc.addImage(qr, "PNG", 95, 275, 20, 20);
    }

    if (save) {
      doc.save(fileName);
    }

    const blob = doc.output("blob");
    return new File([blob], fileName, { type: "application/pdf" });
  }

  window.Kfw296Pdf = {
    createPdfFileFromPayload,
  };
})();
