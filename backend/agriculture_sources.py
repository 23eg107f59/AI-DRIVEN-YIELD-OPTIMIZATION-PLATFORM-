"""Verified public source definitions for regional agricultural statistics."""

SOURCES = (
    {
        "source_id": "icar_nsri_cropwise_oilseed_apy",
        "name": "ICAR-NSRI crop-wise oilseed APY (India)",
        "url": "https://icar-nsri.res.in/pdfdoc/cropAPY.xlsx",
        "access_method": "Public XLSX download",
        "scope": "India, crop and agricultural year",
        "parser": "cropwise",
    },
    {
        "source_id": "icar_nsri_statewise_soybean_apy",
        "name": "ICAR-NSRI state-wise soybean APY",
        "url": "https://icar-nsri.res.in/pdfdoc/stateAPY.xlsx",
        "access_method": "Public XLSX download",
        "scope": "Indian states, soybean and agricultural year",
        "parser": "statewise_soybean",
    },
)

UNVERIFIED_SOURCES = (
    {
        "source_id": "desagri",
        "name": "Directorate of Economics and Statistics (DESAgri)",
        "url": "https://data.desagri.gov.in/website/crops-apy-report-web",
        "access_method": "Interactive report form; no stable public export endpoint verified",
    },
    {
        "source_id": "data_gov_in",
        "name": "India Open Government Data (data.gov.in)",
        "url": "https://www.data.gov.in/",
        "access_method": "No dataset/API schema verified; automated site access returned HTTP 403",
    },
    {
        "source_id": "upag",
        "name": "UPAg",
        "url": "https://www.upag.gov.in/primary-estimate-report",
        "access_method": "Public report page; no stable downloadable dataset/API schema verified",
    },
)

SOURCE_BY_ID = {source["source_id"]: source for source in SOURCES}
