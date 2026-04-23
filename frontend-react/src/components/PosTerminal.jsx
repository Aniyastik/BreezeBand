import { useState } from 'react'
import { API_BASE } from '../api'

export default function PosTerminal() {
  const [amount, setAmount] = useState('')
  const [scannedUid, setScannedUid] = useState('')
  const [status, setStatus] = useState({ msg: 'Hazırdır', type: '' })
  const [isScanning, setIsScanning] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)

  // NFC-ni oxu və ID-ni ekrana yaz (ödəniş etmə, sadəcə oxu)
  const handleScan = async () => {
    if (isScanning) return;

    try {
      if ('NDEFReader' in window) {
        setIsScanning(true);
        const ndef = new window.NDEFReader()
        await ndef.scan()
        setStatus({ msg: "Qolbağı telefona yaxınlaşdırın...", type: "status-waiting" })

        let hasRead = false;
        ndef.onreadingerror = () => {
          setStatus({ msg: "Oxuma xətası. Yenidən cəhd edin.", type: "status-error" });
          setIsScanning(false);
        };

        ndef.onreading = (event) => {
          if (hasRead) return;
          hasRead = true;
          const nfc_uid = event.serialNumber;
          setScannedUid(nfc_uid);
          setStatus({ msg: `Qolbaq oxundu: ${nfc_uid}`, type: "status-success" });
          setIsScanning(false);
        }
      } else {
        setStatus({ msg: "NFC dəstəklənmir. Aşağıda manual ID daxil edin.", type: "status-error" })
      }
    } catch (error) {
      setIsScanning(false);
      setStatus({ msg: "NFC xətası: " + error.message, type: "status-error" })
    }
  }

  // Ödənişi göndər
  const handlePay = async () => {
    const amt = parseFloat(amount)
    const uid = scannedUid.trim()

    if (!amt || amt <= 0) {
      setStatus({ msg: "Məbləği düzgün daxil edin", type: "status-error" })
      return
    }
    if (!uid) {
      setStatus({ msg: "Əvvəlcə qolbağı oxudun və ya ID daxil edin", type: "status-error" })
      return
    }

    setIsProcessing(true);
    setStatus({ msg: "Ödəniş göndərilir...", type: "status-waiting" });

    try {
      const response = await fetch(`${API_BASE}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nfc_uid: uid,
          vendor_id: 1,
          amount: amt
        })
      })

      let data;
      const text = await response.text();
      try {
        data = text ? JSON.parse(text) : {};
      } catch (e) {
        data = { detail: "Sistem xətası (Server boş cavab qaytardı)" };
      }

      if (response.ok) {
        setStatus({ msg: `Uğurlu! Qalıq: ${data.remaining_balance} AZN`, type: "status-success" })
        setAmount('')
        setScannedUid('')
      } else {
        setStatus({ msg: `Xəta: ${data.detail || 'Naməlum xəta'}`, type: "status-error" })
      }
    } catch (error) {
      setStatus({ msg: "Serverə qoşulmaq alınmadı: " + error.message, type: "status-error" })
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <div className="glass-card">
      <div className="pulse-circle">
        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M4 4h4v2H6v2H4V4zm16 0h-4v2h2v2h2V4zM4 20h4v-2H6v-2H4v4zm16 0h-4v-2h2v-2h2v4z"/>
            <path d="M12 8a4 4 0 100 8 4 4 0 000-8zm0 6a2 2 0 110-4 2 2 0 010 4z"/>
        </svg>
      </div>
      <h2 style={{ marginTop: '20px' }}>POS Terminal</h2>

      {/* Məbləğ */}
      <div className="input-group currency-suffix">
        <label>Məbləğ (AZN)</label>
        <input 
          type="number" 
          className="large-amount"
          placeholder="0.00" 
          step="0.01" 
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </div>

      {/* ADDIM 1: NFC oxu */}
      <div style={{ 
        background: 'rgba(255,255,255,0.05)', 
        borderRadius: '16px', 
        padding: '20px', 
        marginBottom: '20px',
        border: scannedUid ? '1px solid rgba(0,230,118,0.3)' : '1px solid rgba(255,255,255,0.1)'
      }}>
        <div style={{ fontSize: '12px', opacity: 0.6, marginBottom: '10px' }}>ADDIM 1: Qolbağı oxudun</div>
        
        <button 
          className="btn-primary" 
          onClick={handleScan}
          disabled={isScanning}
          style={{ 
            marginBottom: '15px',
            background: isScanning ? 'rgba(255,255,255,0.1)' : 'linear-gradient(135deg, #00b0ff, #0091ea)',
            boxShadow: isScanning ? 'none' : '0 10px 20px rgba(0,176,255,0.3)'
          }}
        >
          {isScanning ? '⏳ Gözləyirəm... Qolbağı yaxınlaşdırın' : '📡 NFC Skan Et'}
        </button>

        <div style={{ textAlign: 'center', margin: '10px 0', opacity: 0.4, fontSize: '12px' }}>— və ya manual daxil edin —</div>

        <div className="input-group" style={{ margin: 0 }}>
          <input 
            type="text" 
            placeholder="NFC ID (məs: 04:e1:f9:92:ca:2a:81)" 
            value={scannedUid}
            onChange={(e) => setScannedUid(e.target.value)}
            style={{ textAlign: 'center', fontSize: '14px' }}
          />
        </div>

        {scannedUid && (
          <div style={{ 
            marginTop: '10px', 
            padding: '8px 16px', 
            background: 'rgba(0,230,118,0.1)', 
            borderRadius: '8px',
            color: '#00e676',
            fontSize: '13px',
            textAlign: 'center'
          }}>
            ✅ Qolbaq: {scannedUid}
          </div>
        )}
      </div>

      {/* ADDIM 2: Ödəniş et */}
      <button 
        className="btn-primary" 
        onClick={handlePay}
        disabled={isProcessing || !scannedUid || !amount}
        style={{
          opacity: (!scannedUid || !amount) ? 0.4 : 1,
          background: isProcessing ? 'rgba(255,255,255,0.1)' : undefined
        }}
      >
        {isProcessing ? '⏳ Gözləyin...' : '💳 Ödənişi Təsdiq Et'}
      </button>

      {status.msg && <div className={`status-msg ${status.type}`}>{status.msg}</div>}
    </div>
  )
}
