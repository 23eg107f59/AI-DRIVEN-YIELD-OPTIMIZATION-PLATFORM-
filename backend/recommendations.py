def generate_recommendations(values):
    items = []

    ph = values["soil_ph"]
    if ph < 5.5 or ph > 7.8:
        items.append(
            {
                "category": "Soil pH",
                "level": "attention",
                "text": "The reported pH is outside a commonly preferred range for many oilseeds. Confirm with a local soil test before considering amendments.",
            }
        )
    else:
        items.append(
            {
                "category": "Soil pH",
                "level": "good",
                "text": "The reported pH is within a broadly suitable range for many oilseeds; crop-specific and local guidance still applies.",
            }
        )

    if values["irrigation"].lower() in {"rainfed", "none"}:
        items.append(
            {
                "category": "Water management",
                "level": "attention",
                "text": "For rainfed production, consider local rainfall timing and soil moisture when planning sowing. Supplemental irrigation feasibility depends on water availability.",
            }
        )
    else:
        items.append(
            {
                "category": "Water management",
                "level": "info",
                "text": "Schedule irrigation around crop stage and measured soil moisture, while avoiding waterlogging. Local extension guidance can refine timing.",
            }
        )

    nutrient_values = {
        "nitrogen": values["nitrogen_kg_ha"],
        "phosphorus": values["phosphorus_kg_ha"],
        "potassium": values["potassium_kg_ha"],
    }
    if min(nutrient_values.values()) < 20:
        items.append(
            {
                "category": "Nutrient management",
                "level": "attention",
                "text": "At least one reported nutrient input is low. Use a soil test and crop-specific local recommendations before changing fertilizer rates.",
            }
        )
    else:
        items.append(
            {
                "category": "Nutrient management",
                "level": "info",
                "text": "Keep nutrient applications aligned with soil-test results and local crop recommendations; avoid applying nutrients without a diagnosed need.",
            }
        )

    rainfall = values["rainfall_mm"]
    temperature = values["temperature_c"]
    if rainfall < 250 or rainfall > 1800:
        items.append(
            {
                "category": "Weather conditions",
                "level": "attention",
                "text": "The reported rainfall is at an unusually low or high end for this broad screening rule. Verify the value and assess local seasonal forecasts and drainage.",
            }
        )
    if temperature < 10 or temperature > 38:
        items.append(
            {
                "category": "Weather conditions",
                "level": "attention",
                "text": "The reported temperature is outside the broad screening range used here. Check crop-stage-specific local advisories and verify the input.",
            }
        )
    if rainfall >= 250 and rainfall <= 1800 and temperature >= 10 and temperature <= 38:
        items.append(
            {
                "category": "Weather conditions",
                "level": "info",
                "text": "The reported weather values are within the broad screening bounds. Seasonal timing and local microclimate can still affect crop outcomes.",
            }
        )

    items.append(
        {
            "category": "Soil management",
            "level": "info",
            "text": "Maintain soil cover and organic matter where practical, rotate crops appropriately, and follow locally recommended erosion and pest-management practices.",
        }
    )
    return {
        "recommendations": items,
        "notice": "These rule-based suggestions are general screening guidance, not scientifically validated personalized advice or a guarantee of yield improvement.",
    }
