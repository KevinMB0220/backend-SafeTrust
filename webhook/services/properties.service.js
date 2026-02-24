const axios = require('axios');

async function fetchProperties({ type, limit, offset }) {
  const HASURA_URL = process.env.HASURA_URL;
  const HASURA_ADMIN_SECRET = process.env.HASURA_ADMIN_SECRET;

  try {
    if (process.env.USE_MOCK_DATA === 'true') {
      return generateMockData(type, limit, offset);
    }

    if (!HASURA_URL || !HASURA_ADMIN_SECRET) {
      throw new Error('Hasura environment variables not configured');
    }

    const query = `
      query FetchProperties($limit: Int!, $offset: Int!) {
        apartments(where: { is_available: { _eq: true } }, limit: $limit, offset: $offset) {
          id name price location_area created_at
          apartment_images(limit: 1) { image_url }
        }
        hotels(limit: $limit, offset: $offset) {
          id name description address location_area created_at
          rooms(limit: 1, order_by: { price_night: asc }) { price_night }
        }
      }
    `;

    const response = await axios.post(HASURA_URL, { query, variables: { limit, offset } }, {
      headers: { 'Content-Type': 'application/json', 'x-hasura-admin-secret': HASURA_ADMIN_SECRET }
    });

    if (response?.data?.errors) throw new Error(response.data.errors[0].message);

    const apartments = response?.data?.data?.apartments || [];
    const hotels = response?.data?.data?.hotels || [];
    let unified = [];

    if (type === 'apartment' || type === 'all') {
      unified.push(...apartments.map(a => ({
        id: a.id, type: 'apartment', name: a.name, price: parseFloat(a.price),
        location: a.location_area, image: a.apartment_images?.[0]?.image_url || null,
        created_at: a.created_at
      })));
    }

    if (type === 'hotel' || type === 'all') {
      unified.push(...hotels.map(h => ({
        id: h.id, type: 'hotel', name: h.name, description: h.description,
        price: h.rooms?.[0]?.price_night ? parseFloat(h.rooms[0].price_night) : null,
        location: h.location_area, address: h.address, image: null, created_at: h.created_at
      })));
    }

    unified.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return unified;
  } catch (error) {
    console.error('Hasura fetch error:', error.message);
    throw new Error('Failed to fetch properties from Hasura');
  }
}

async function searchProperties(filters) {
  if (process.env.USE_MOCK_DATA === 'true') {
    return generateSearchMockData(filters);
  }

  const HASURA_URL = process.env.HASURA_URL;
  const HASURA_ADMIN_SECRET = process.env.HASURA_ADMIN_SECRET;

  if (!HASURA_URL || !HASURA_ADMIN_SECRET) {
    throw new Error('Hasura environment variables not configured');
  }

  const { location, minPrice, maxPrice, type = 'all', orderBy = 'created_at', order = 'desc', limit = 10, offset = 0 } = filters;

  try {
    let apartments = [];
    let hotels = [];

    // Search apartments
    if (type === 'apartment' || type === 'all') {
      apartments = await searchApartments({ location, minPrice, maxPrice, limit, offset }, HASURA_URL, HASURA_ADMIN_SECRET);
    }

    // Search hotels
    if (type === 'hotel' || type === 'all') {
      hotels = await searchHotels({ location, minPrice, maxPrice, limit, offset }, HASURA_URL, HASURA_ADMIN_SECRET);
    }

    // Merge and sort
    let unified = [...apartments, ...hotels];
    unified = sortProperties(unified, orderBy, order);

    // Paginate combined results
    return unified.slice(offset, offset + limit);
  } catch (error) {
    console.error('Hasura search error:', error.message);
    throw new Error('Failed to search properties from Hasura');
  }
}

async function searchApartments(filters, HASURA_URL, HASURA_ADMIN_SECRET) {
  const { location, minPrice, maxPrice, limit, offset } = filters;

  // Build where conditions
  const whereConditions = [{ is_available: { _eq: true } }];

  if (location) {
    whereConditions.push({ location_area: { _ilike: `%${location}%` } });
  }
  if (minPrice !== undefined) {
    whereConditions.push({ price: { _gte: minPrice } });
  }
  if (maxPrice !== undefined) {
    whereConditions.push({ price: { _lte: maxPrice } });
  }

  const where = whereConditions.length > 1 ? { _and: whereConditions } : whereConditions[0];

  const query = `
    query SearchApartments($where: apartments_bool_exp!, $limit: Int!, $offset: Int!) {
      apartments(where: $where, limit: $limit, offset: $offset) {
        id name description price address location_area is_available created_at
      }
    }
  `;

  const response = await axios.post(HASURA_URL,
    { query, variables: { where, limit: limit * 2, offset } },
    { headers: { 'Content-Type': 'application/json', 'x-hasura-admin-secret': HASURA_ADMIN_SECRET } }
  );

  if (response?.data?.errors) throw new Error(response.data.errors[0].message);

  const apartments = response?.data?.data?.apartments || [];

  return apartments.map(a => ({
    id: a.id, type: 'apartment', name: a.name, description: a.description,
    price: parseFloat(a.price), location: a.location_area,
    address: typeof a.address === 'string' ? a.address : JSON.stringify(a.address),
    available: a.is_available, image: null,
    created_at: a.created_at
  }));
}

async function searchHotels(filters, HASURA_URL, HASURA_ADMIN_SECRET) {
  const { location, minPrice, maxPrice, limit, offset } = filters;

  const whereConditions = [];
  if (location) {
    whereConditions.push({ location_area: { _ilike: `%${location}%` } });
  }

  const where = whereConditions.length > 0 ? { _and: whereConditions } : {};

  const query = `
    query SearchHotels($where: hotels_bool_exp!, $limit: Int!, $offset: Int!) {
      hotels(where: $where, limit: $limit, offset: $offset) {
        id name description address location_area created_at
      }
    }
  `;

  const response = await axios.post(HASURA_URL,
    { query, variables: { where, limit: limit * 2, offset } },
    { headers: { 'Content-Type': 'application/json', 'x-hasura-admin-secret': HASURA_ADMIN_SECRET } }
  );

  if (response?.data?.errors) throw new Error(response.data.errors[0].message);

  const hotels = response?.data?.data?.hotels || [];

  // Map hotels (price will be null since we don't have rooms relation yet)
  let results = hotels.map(h => ({
    id: h.id, type: 'hotel', name: h.name, description: h.description,
    price: null, // TODO: Add rooms relation to get price
    location: h.location_area, address: h.address, available: true, image: null,
    created_at: h.created_at
  }));

  // Filter by price after fetching
  if (minPrice !== undefined) {
    results = results.filter(h => h.price !== null && h.price >= minPrice);
  }
  if (maxPrice !== undefined) {
    results = results.filter(h => h.price !== null && h.price <= maxPrice);
  }

  return results;
}

function sortProperties(properties, orderBy, order) {
  return properties.sort((a, b) => {
    let compareValue = 0;

    switch (orderBy) {
      case 'price':
        compareValue = (a.price || 0) - (b.price || 0);
        break;
      case 'name':
        compareValue = a.name.localeCompare(b.name);
        break;
      case 'created_at':
      default:
        compareValue = new Date(a.created_at) - new Date(b.created_at);
        break;
    }

    return order === 'asc' ? compareValue : -compareValue;
  });
}

function generateSearchMockData(filters) {
  const mockData = [
    { id: 'mock-1', type: 'apartment', name: 'Luxury Apartment Downtown', description: 'Beautiful 2BR', price: 1500, city: 'Mumbai', location: 'Downtown', bedrooms: 2, bathrooms: 2, address: '123 Main St', available: true, image: 'https://via.placeholder.com/300', created_at: new Date().toISOString() },
    { id: 'mock-2', type: 'apartment', name: 'Cozy Studio Near Beach', description: 'Affordable studio', price: 800, city: 'Goa', location: 'Beach Area', bedrooms: 1, bathrooms: 1, address: '456 Ocean Drive', available: true, image: 'https://via.placeholder.com/300', created_at: new Date(Date.now() - 86400000).toISOString() },
    { id: 'mock-3', type: 'hotel', name: 'Grand Plaza Hotel', description: '5-star hotel', price: 2500, location: 'Business District', address: '789 Business Ave', available: true, image: 'https://via.placeholder.com/300', created_at: new Date(Date.now() - 172800000).toISOString() },
    { id: 'mock-4', type: 'apartment', name: 'Spacious 3BR Family Home', description: 'Perfect for families', price: 2200, city: 'Delhi', location: 'Suburbs', bedrooms: 3, bathrooms: 2, address: '321 Family Lane', available: true, image: 'https://via.placeholder.com/300', created_at: new Date(Date.now() - 259200000).toISOString() }
  ];

  let filtered = mockData;
  if (filters.type && filters.type !== 'all') filtered = filtered.filter(i => i.type === filters.type);
  if (filters.location) {
    const loc = filters.location.toLowerCase();
    filtered = filtered.filter(i => i.city?.toLowerCase().includes(loc) || i.location?.toLowerCase().includes(loc));
  }
  if (filters.minPrice !== undefined) filtered = filtered.filter(i => i.price >= filters.minPrice);
  if (filters.maxPrice !== undefined) filtered = filtered.filter(i => i.price <= filters.maxPrice);

  return filtered.slice(filters.offset || 0, (filters.offset || 0) + (filters.limit || 10));
}

function generateMockData(type, limit, offset) {
  const mockData = [
    { id: 'mock-1', type: 'apartment', name: 'Demo Apartment', price: 1500, city: 'Mumbai', image: 'https://via.placeholder.com/300', created_at: new Date().toISOString() },
    { id: 'mock-2', type: 'hotel', name: 'Demo Hotel', price: 2500, city: 'Delhi', image: 'https://via.placeholder.com/300', created_at: new Date().toISOString() }
  ];
  let filtered = type === 'all' ? mockData : mockData.filter(i => i.type === type);
  return filtered.slice(offset, offset + limit);
}

module.exports = { fetchProperties, searchProperties };
