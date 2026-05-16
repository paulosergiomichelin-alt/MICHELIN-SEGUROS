
export interface DeviceInfo {
  ip: string;
  userAgent: string;
  deviceType: 'desktop' | 'mobile' | 'tablet';
  browser: string;
  os: string;
  location: string;
}

class DeviceInfoServiceClass {
  private cached: DeviceInfo | null = null;
  private promise: Promise<DeviceInfo> | null = null;

  private parseBrowser(ua: string): string {
    if (ua.includes('Edg/')) return 'Edge';
    if (ua.includes('OPR/') || ua.includes('Opera')) return 'Opera';
    if (ua.includes('Chrome/')) return 'Chrome';
    if (ua.includes('Firefox/')) return 'Firefox';
    if (/Safari\//.test(ua) && !ua.includes('Chrome')) return 'Safari';
    return 'Navegador';
  }

  private parseOS(ua: string): string {
    if (/Windows NT 10\.0/.test(ua)) return 'Windows 10/11';
    if (/Windows NT/.test(ua)) return 'Windows';
    if (/Mac OS X/.test(ua)) return 'macOS';
    if (/Android/.test(ua)) return 'Android';
    if (/iPhone|iPad/.test(ua)) return 'iOS';
    if (/Linux/.test(ua)) return 'Linux';
    return 'Desconhecido';
  }

  private parseDeviceType(ua: string): 'desktop' | 'mobile' | 'tablet' {
    if (/iPad|Tablet/i.test(ua)) return 'tablet';
    if (/Mobile|Android|iPhone/i.test(ua)) return 'mobile';
    return 'desktop';
  }

  async getInfo(): Promise<DeviceInfo> {
    if (this.cached) return this.cached;
    if (this.promise) return this.promise;

    this.promise = (async () => {
      const ua = navigator.userAgent;
      let ip = '0.0.0.0';
      let location = 'Desconhecido';

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 4000);
        const res = await fetch('https://ipapi.co/json/', { signal: controller.signal });
        clearTimeout(timeout);
        if (res.ok) {
          const data = await res.json();
          ip = data.ip || '0.0.0.0';
          const city = data.city || '';
          const region = data.region_code || '';
          location = [city, region].filter(Boolean).join('-') || data.country_name || 'Desconhecido';
        }
      } catch {
        // offline ou bloqueado — usa defaults
      }

      this.cached = {
        ip,
        userAgent: ua,
        deviceType: this.parseDeviceType(ua),
        browser: this.parseBrowser(ua),
        os: this.parseOS(ua),
        location,
      };
      return this.cached;
    })();

    return this.promise;
  }

  prefetch(): void {
    void this.getInfo();
  }

  getCached(): DeviceInfo | null {
    return this.cached;
  }
}

export const DeviceInfoService = new DeviceInfoServiceClass();
