import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import API from "../services/api";

export const fetchPropertyAnalysis = createAsyncThunk(
  "advisory/fetchPropertyAnalysis",
  async (propertyData, { rejectWithValue }) => {
    try {
      const response = await API.post("/advisory/property", propertyData);
      return response.data.analysis;
    } catch (error) {
      return rejectWithValue(error.message || "Failed to analyze property");
    }
  }
);

export const fetchPortfolioAnalysis = createAsyncThunk(
  "advisory/fetchPortfolioAnalysis",
  async (portfolioData, { rejectWithValue }) => {
    try {
      const response = await API.post("/advisory/portfolio", portfolioData);
      return response.data.portfolioAnalysis;
    } catch (error) {
      return rejectWithValue(error.message || "Failed to analyze portfolio");
    }
  }
);

const advisorySlice = createSlice({
  name: "advisory",
  initialState: {
    property: {
      data: null,
      loading: false,
      error: null,
    },
    portfolio: {
      data: null,
      loading: false,
      error: null,
    },
  },
  reducers: {
    clearPropertyAnalysis: (state) => {
      state.property.data = null;
      state.property.error = null;
    },
    clearPortfolioAnalysis: (state) => {
      state.portfolio.data = null;
      state.portfolio.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // Single property
      .addCase(fetchPropertyAnalysis.pending, (state) => {
        state.property.loading = true;
        state.property.error = null;
      })
      .addCase(fetchPropertyAnalysis.fulfilled, (state, action) => {
        state.property.loading = false;
        state.property.data = action.payload;
      })
      .addCase(fetchPropertyAnalysis.rejected, (state, action) => {
        state.property.loading = false;
        state.property.error = action.payload;
      })
      // Portfolio
      .addCase(fetchPortfolioAnalysis.pending, (state) => {
        state.portfolio.loading = true;
        state.portfolio.error = null;
      })
      .addCase(fetchPortfolioAnalysis.fulfilled, (state, action) => {
        state.portfolio.loading = false;
        state.portfolio.data = action.payload;
      })
      .addCase(fetchPortfolioAnalysis.rejected, (state, action) => {
        state.portfolio.loading = false;
        state.portfolio.error = action.payload;
      });
  },
});

export const { clearPropertyAnalysis, clearPortfolioAnalysis } = advisorySlice.actions;
export default advisorySlice.reducer;
