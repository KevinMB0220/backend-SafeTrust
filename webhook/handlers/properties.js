const { fetchProperties, searchProperties } = require("../services/properties.service");

async function getProperties(req, res) {
  try {
    let { type = "all", limit = 10, offset = 0 } = req.query;

    limit = parseInt(limit);
    offset = parseInt(offset);

    if (!["apartment", "hotel", "all"].includes(type)) {
      return res.status(400).json({
        success: false,
        error: "Invalid type. Must be apartment, hotel, or all",
      });
    }

    if (isNaN(limit) || isNaN(offset)) {
      return res.status(400).json({
        success: false,
        error: "Limit and offset must be numbers",
      });
    }

    if (limit > 100) {
      return res.status(400).json({
        success: false,
        error: "Limit cannot exceed 100",
      });
    }

    const properties = await fetchProperties({
      type,
      limit,
      offset,
    });

    return res.status(200).json({
      success: true,
      data: properties,
      pagination: {
        limit,
        offset,
        count: properties.length,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message || "Internal server error",
    });
  }
}

async function searchPropertiesHandler(req, res) {
  try {
    let {
      location,
      minPrice,
      maxPrice,
      bedrooms,
      type = "all",
      orderBy = "created_at",
      order = "desc",
      limit = 10,
      offset = 0,
    } = req.query;

    limit = parseInt(limit);
    offset = parseInt(offset);
    if (minPrice !== undefined) minPrice = parseFloat(minPrice);
    if (maxPrice !== undefined) maxPrice = parseFloat(maxPrice);
    if (bedrooms !== undefined) bedrooms = parseInt(bedrooms);

    if (!["apartment", "hotel", "all"].includes(type)) {
      return res.status(400).json({
        success: false,
        error: "Invalid type. Must be apartment, hotel, or all",
      });
    }

    if (isNaN(limit) || isNaN(offset)) {
      return res.status(400).json({
        success: false,
        error: "Limit and offset must be valid numbers",
      });
    }

    if (limit > 100 || limit < 1) {
      return res.status(400).json({
        success: false,
        error: "Limit must be between 1 and 100",
      });
    }

    if (offset < 0) {
      return res.status(400).json({
        success: false,
        error: "Offset must be a positive number",
      });
    }

    if (minPrice !== undefined && (isNaN(minPrice) || minPrice < 0)) {
      return res.status(400).json({
        success: false,
        error: "minPrice must be a valid positive number",
      });
    }

    if (maxPrice !== undefined && (isNaN(maxPrice) || maxPrice < 0)) {
      return res.status(400).json({
        success: false,
        error: "maxPrice must be a valid positive number",
      });
    }

    if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
      return res.status(400).json({
        success: false,
        error: "minPrice cannot be greater than maxPrice",
      });
    }

    if (bedrooms !== undefined && (isNaN(bedrooms) || bedrooms < 0)) {
      return res.status(400).json({
        success: false,
        error: "bedrooms must be a valid positive number",
      });
    }

    const validOrderByFields = ["price", "created_at", "name"];
    if (!validOrderByFields.includes(orderBy)) {
      return res.status(400).json({
        success: false,
        error: `orderBy must be one of: ${validOrderByFields.join(", ")}`,
      });
    }

    if (!["asc", "desc"].includes(order)) {
      return res.status(400).json({
        success: false,
        error: "order must be either asc or desc",
      });
    }

    const properties = await searchProperties({
      location,
      minPrice,
      maxPrice,
      bedrooms,
      type,
      orderBy,
      order,
      limit,
      offset,
    });

    return res.status(200).json({
      success: true,
      data: properties,
      pagination: {
        limit,
        offset,
        count: properties.length,
      },
      filters: {
        location: location || null,
        minPrice: minPrice || null,
        maxPrice: maxPrice || null,
        bedrooms: bedrooms || null,
        type,
        orderBy,
        order,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message || "Internal server error",
    });
  }
}

module.exports = {
  getProperties,
  searchPropertiesHandler,
};
