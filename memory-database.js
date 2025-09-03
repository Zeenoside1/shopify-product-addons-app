// In-memory database for Railway compatibility
class MemoryDatabase {
  constructor() {
    this.sessions = new Map();
    this.addons = new Map();
    this.addonCounter = 1;
    console.log('Using in-memory database for Railway compatibility');
  }

  // Session management
  async storeSession(session) {
    console.log('Storing session for shop:', session.shop);
    this.sessions.set(session.shop, session);
    return Promise.resolve(session);
  }

  async getSession(shop) {
    console.log('Getting session for shop:', shop);
    const session = this.sessions.get(shop);
    console.log('Session found:', !!session);
    return Promise.resolve(session || null);
  }

  // Addon management
  async createAddon(addonData) {
    const addon = {
      id: this.addonCounter++,
      ...addonData,
      created_at: new Date().toISOString()
    };
    
    const key = `${addonData.productId}-${addonData.shop}`;
    if (!this.addons.has(key)) {
      this.addons.set(key, []);
    }
    this.addons.get(key).push(addon);
    
    console.log('Created addon:', addon.id, 'for product:', addonData.productId);
    return Promise.resolve(addon);
  }

  async getAddons(productId, shop = 'default') {
    const key = `${productId}-${shop}`;
    const addons = this.addons.get(key) || [];
    console.log('Getting addons for product:', productId, 'shop:', shop, 'found:', addons.length);
    return Promise.resolve(addons.filter(addon => addon.active !== false));
  }

  async updateAddon(id, updateData) {
    // Find and update addon across all products
    for (let [key, addons] of this.addons) {
      const addonIndex = addons.findIndex(addon => addon.id == id);
      if (addonIndex !== -1) {
        addons[addonIndex] = { ...addons[addonIndex], ...updateData };
        console.log('Updated addon:', id);
        return Promise.resolve(addons[addonIndex]);
      }
    }
    throw new Error('Addon not found');
  }

  async deleteAddon(id) {
    // Find and mark as inactive
    for (let [key, addons] of this.addons) {
      const addonIndex = addons.findIndex(addon => addon.id == id);
      if (addonIndex !== -1) {
        addons[addonIndex].active = false;
        console.log('Deleted addon:', id);
        return Promise.resolve({ id, changes: 1 });
      }
    }
    throw new Error('Addon not found');
  }

  async getAllAddons(shop = 'default') {
    const allAddons = [];
    for (let [key, addons] of this.addons) {
      if (key.endsWith(`-${shop}`)) {
        allAddons.push(...addons.filter(addon => addon.active !== false));
      }
    }
    return Promise.resolve(allAddons);
  }
}

module.exports = MemoryDatabase;